require 'sinatra'
require 'sinatra/json'
require 'json'
require 'mail'
require 'net/smtp'
require 'net/http'
require 'uri'
require 'digest'
require 'dotenv/load' if ENV['RACK_ENV'] != 'production'
require_relative 'database'
require_relative 'facebook'
require_relative 'google_sheets'
require_relative 'geoip'
require_relative 'whatsapp_webhook'
# Cloudinary gem not needed - we're only using static URLs in frontend

# Configuration
set :public_folder, 'public'
set :port, ENV['PORT'] || 4568
set :bind, '0.0.0.0'
set :sessions, true
set :host_authorization, { permitted_hosts: [] }

# Puma configuration is in config/puma.rb
# Note: server_settings here are ignored when config/puma.rb exists

# Production optimizations
configure :production do
  set :server, :puma

  # Enable gzip compression
  use Rack::Deflater
  # Allow localhost for healthchecks, plus production domains (with and without www)
  set :host_authorization, { permitted_hosts: ["amoredit.com", "www.amoredit.com", "imagery.amoredit.com", "localhost", "127.0.0.1"] }
  # Serve static files efficiently
  set :static_cache_control, [:public, max_age: 31536000]
end

# Initialize components
$db = Database.new
$fb_tracker = FacebookTracker.new
$google_sheets = GoogleSheetsIntegration.new
$geoip = GeoIP.new
$whatsapp_webhook = WhatsAppWebhook.new($db, $fb_tracker)
configure :development do
  set :host_authorization, { permitted_hosts: [] }
end

# Graceful shutdown handlers - close DB connections when container stops
at_exit do
  $db.shutdown if $db
end

Signal.trap("SIGTERM") do
  
  $db.shutdown if $db
  exit(0)
end

Signal.trap("SIGINT") do
  
  $db.shutdown if $db
  exit(0)
end
# Mail configuration - configure once at startup
begin
  Mail.defaults do
    delivery_method :smtp, {
      address: 'smtp-relay.brevo.com',
      port: 587,
      domain: 'amoredit.com',
      user_name: ENV['BREVO_SMTP_LOGIN'],
      password: ENV['BREVO_SMTP_PASSWORD'],
      authentication: 'plain',
      enable_starttls_auto: true
    }
  end
  
rescue => e
  
end

# Routes
get '/' do
  # Check if this is the imagery subdomain
  if request.host.start_with?('imagery.')
    # Set marker cookie that will block access to main site for 15 minutes
    response.set_cookie('imagery_visitor',
      value: 'true',
      domain: '.amoredit.com', # Accessible across all subdomains
      path: '/',
      expires: Time.now + (15 * 60), # 15 minutes
      httponly: true
    )
    send_file File.join('public', 'imagery.html')
  else
    # Main site - block access if they visited imagery subdomain
    if request.cookies['imagery_visitor'] == 'true'
      halt 404, "Not Found"
    end
    send_file File.join('public', 'index.html')
  end
end

# Privacy policy page
get '/privacy-policy' do
  send_file File.join('public', 'privacy-policy.html')
end

# Imagery desktop app download page
get '/imagery' do
  # Set marker cookie that will block access to main site for 15 minutes
  response.set_cookie('imagery_visitor',
    value: 'true',
    domain: '.amoredit.com', # Accessible across all subdomains
    path: '/',
    expires: Time.now + (15 * 60), # 15 minutes
    httponly: true
  )
  send_file File.join('public', 'imagery.html')
end

# Optional alias for convenience (/download)
get '/download' do
  redirect '/imagery'
end

# Serve GLB models list - looks in assets directory for .glb files
get '/api/models' do
  content_type :json
  
  models = Dir.glob('assets/*.{glb,gltf}').map do |file|
    {
      name: File.basename(file, File.extname(file)),
      url: "/#{file}",
      size: File.size(file)
    }
  end
  
  content_type :json
  models.to_json
end

# Serve GLB files directly from assets folder
get '/assets/*.glb' do |filename|
  send_file "assets/#{filename}.glb"
end

get '/assets/*.gltf' do |filename|
  send_file "assets/#{filename}.gltf"
end

# Serve picture files
get '/pictures/*' do |filename|
  send_file "pictures/#{filename}"
end

# Warm up database connection (called on page load)
get '/api/warmup' do
  
  start_time = Time.now
  content_type :json
  $db.ensure_connection
  duration = ((Time.now - start_time) * 1000).round(2)
  
  { status: 'ready', duration_ms: duration }.to_json
end

# Check available time slots for a specific date
get '/api/available-slots/:date' do
  
  request_start = Time.now
  content_type :json

  date = params[:date]

  # Get existing bookings for this date
  db_start = Time.now
  existing_bookings = $db.get_bookings_for_date(date)
  db_duration = ((Time.now - db_start) * 1000).round(2)
  

  # All possible time slots
  # Time slots from 10:00 AM to 9:30 PM
  all_slots = [
    '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
    '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
    '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
    '21:00', '21:30'
  ]

  # Get booked time slots (remove seconds for consistency with frontend)
  booked_slots = existing_bookings.map { |booking|
    time = booking[:selected_time]
    # Convert "HH:MM:SS" to "HH:MM" format
    time.is_a?(String) ? time[0, 5] : time.strftime("%H:%M")
  }

  # Get masked names for booked slots (secure approach)
  booking_details = {}
  booked_slots.each do |time_slot|
    masked_name = $db.get_masked_name_for_time_slot(date, time_slot)
    booking_details[time_slot] = masked_name if masked_name
  end

  # Return available slots
  available_slots = all_slots - booked_slots

  total_duration = ((Time.now - request_start) * 1000).round(2)
  

  {
    date: date,
    available_slots: available_slots,
    booked_slots: booked_slots,
    booking_details: booking_details
  }.to_json
end

# Booking form step 1 - Contact details (old multi-step form)
get '/booking-form' do
  selected_date = params['selected_date']
  selected_time = params['selected_time']

  erb :booking_form, locals: {
    selected_date: selected_date,
    selected_time: selected_time
  }
end

# Unified booking form (new single-page form)
get '/unified-booking-form' do
  erb :unified_booking_form
end
get '/hero-section' do
  erb :hero_section
end

get '/content-section' do
  erb :content_section
end

get '/footer-section' do
  erb :footer_section
end

get '/giveaway-section' do
  erb :giveaway_section
end
# Social media fields partial - no longer needed but keeping for compatibility
get '/social-fields' do
  # Return empty content since we now handle platforms directly in the form
  ""
end

# Submit booking with bot protection
post '/submit-booking' do
  # Bot protection checks - RUN THESE FIRST before Meta tracking to avoid wasting API calls
  honeypot_value = params['user_nickname']
  load_time = params['load_time']

  # 1. Check the Honeypot
  if honeypot_value && !honeypot_value.empty?
    status 429
    halt "Bot detected"
  end

  # 2. Check the Time (must be at least 4 seconds)
  if load_time && !load_time.empty?
    submission_time = Time.now.to_f * 1000  # Convert to milliseconds
    time_difference = submission_time - load_time.to_f

    if time_difference < 4000  # Less than 4 seconds
      status 429
      halt "Submission too fast"
    end
  end

  # 3. Check reCAPTCHA - MANDATORY (no token = auto reject)
  recaptcha_token = params['g-recaptcha-response']

  # Reject if no token provided
  if !recaptcha_token || recaptcha_token.empty?
    status 400
    halt "reCAPTCHA verification required"
  end

  # Verify the token with Google
  recaptcha_score = verify_recaptcha(recaptcha_token)

  # Reject if verification failed
  if recaptcha_score.nil?
    status 400
    halt "reCAPTCHA verification failed"
  end

  # Reject if score is too low (likely bot)
  if recaptcha_score < 0.5
    status 429
    halt "reCAPTCHA verification failed - score too low"
  end


  # 4. Validate input for malicious payloads (SQL injection, XSS, etc.)
  validation_result = validate_booking_input(params)
  if !validation_result[:valid]
    status 400
    halt "Invalid input detected"
  end

  # Bot checks passed - NOW track form start to Meta
  track_facebook_event('Form_Start', request, {
    custom_data: {
      form_type: 'unified_booking'
    }
  })

  # Extract form data
  phone_number = params['phone_number']
  name = params['name']
  email = params['email']
  language = params['language'] || 'en'
  selected_date = params['selected_date']
  selected_time = params['selected_time']

  # 5. Validate required fields are not empty (frontend enforces this, so empty = bot bypass)
  required_fields = {
    'name' => name,
    'phone_number' => phone_number,
    'email' => email
  }

  missing_fields = []
  required_fields.each do |field_name, value|
    if value.nil? || value.to_s.strip.empty?
      missing_fields << field_name
    end
  end

  if !missing_fields.empty?
    # Empty fields = bot bypassing frontend
    status 400
    halt erb(:error_message, locals: {
      message: "Required fields are missing. Please fill out the form completely and try again."
    })
  end

  # Handle occupation selection
  occupation = params['occupation']
  custom_occupation = params['custom_occupation']
  final_occupation = (occupation == 'custom' && custom_occupation && !custom_occupation.empty?) ? custom_occupation : occupation

  # Handle budget selection
  budget = params['budget']

  # Handle multiple social platforms
  social_platforms = params['social_platforms'] || []
  social_usernames = {}
  
  # Debug: Print received params
  
  social_platforms.each do |platform|
    username = params["#{platform}_username"]
    social_usernames[platform] = username if username && !username.empty?
  end
  
  booking_data = {
    name: name,
    phone_number: phone_number,
    email: email,
    language: language,
    selected_date: selected_date,
    selected_time: selected_time,
    occupation: final_occupation,
    budget: budget,
    social_platforms: social_platforms,
    social_usernames: social_usernames
  }
  
  # Save to database
  booking_id = $db.save_booking(booking_data)

  # Send notification email to team
  email_success = send_notification_email(booking_data)

  # Send confirmation email to customer
  customer_email_success = send_customer_confirmation_email(booking_data)

  # Add to Google Sheets
  sheets_result = $google_sheets.add_booking_to_sheet(booking_data)
  
  if booking_id && email_success
    # Track successful booking completion (pure lead tracking - no monetary value)
    track_facebook_event('Booking_Complete', request, {
      email: booking_data[:email],
      first_name: extract_first_name(booking_data[:name]),
      last_name: extract_last_name(booking_data[:name]),
      phone: booking_data[:phone_number],
      external_id: booking_id.to_s,
      custom_data: {
        booking_id: booking_id,
        occupation: booking_data[:occupation],
        social_platforms: booking_data[:social_platforms]&.join(',')
      }
    })

    # Log customer email status
  

    erb :success_message, locals: {
      booking_id: booking_id,
      email: booking_data[:email],
      phone: booking_data[:phone_number]
    }
  else
    status 500
    erb :error_message, locals: { message: "Booking could not be saved. Please try again." }
  end
end

# Track form view event
post '/track/form-view' do
  track_facebook_event('Form_View', request, {
    custom_data: {
      action: 'form_viewed',
      page_section: 'booking'
    }
  })

  { success: true }.to_json
end

# Track form field filled event (user typing in form fields before submission)
post '/track/form-field-filled' do
  content_type :json

  begin
    # Get all form data that user has filled so far
    name = params['name']
    email = params['email']
    phone = params['phone_number']
    field_name = params['field_name'] # Which field was just filled
    event_id = params['event_id'] # Unique event_id from frontend

    track_facebook_event('Form_Field_Filled', request, {
      email: email,
      first_name: extract_first_name(name),
      last_name: extract_last_name(name),
      phone: phone,
      event_id: event_id, # Pass through for deduplication
      custom_data: {
        field_filled: field_name,
        action: 'field_completed',
        page_section: 'booking_form'
      }
    })

    { success: true }.to_json
  rescue => e
    { success: false, error: e.message }.to_json
  end
end

# Track WhatsApp button click as Booking_Complete conversion
post '/track/whatsapp-click' do
  content_type :json

  begin
    event_id = params['event_id'] # Unique event_id from frontend for deduplication

    # Track as Booking_Complete conversion (WhatsApp lead)
    track_facebook_event('Booking_Complete', request, {
      event_id: event_id,
      custom_data: {
        source: 'whatsapp_button',
        lead_type: 'whatsapp_click',
        action: 'whatsapp_redirect'
      }
    })

    { success: true }.to_json
  rescue => e
    { success: false, error: e.message }.to_json
  end
end

# Facebook tracking endpoint - receives data from client, sends to Facebook
post '/track-facebook' do
  content_type :json

  begin
    data = JSON.parse(request.body.read)

    # Prepare event data for Facebook tracker
    event_data = {
      event_name: data['event_name'],
      event_id: data['event_id'],
      email: data['email'],
      phone: data['phone'],
      source_url: data['source_url'] || request.referrer,
      user_agent: data['user_agent'] || request.user_agent,
      fbc: data['fbc'],
      fbp: data['fbp'],
      custom_data: data['custom_data'] || {}
    }

    # Send to Facebook via our dedicated tracker
    result = $fb_tracker.track_event(event_data)

    if result[:error]
      status 500
      { error: result[:error] }.to_json
    else
      status result[:status]
      result[:body].to_json
    end

  rescue JSON::ParserError => e
    status 400
    { error: 'Invalid JSON' }.to_json
  rescue => e
    status 500
    { error: 'Server error' }.to_json
  end
end

# WhatsApp Cloud API webhook endpoints

# Webhook verification (GET) - Meta calls this to verify your endpoint during setup
get '/webhooks/whatsapp' do
  result = $whatsapp_webhook.verify_webhook(params)
  status result[:status]
  result[:body]
end

# Webhook message handler (POST) - Meta sends incoming messages here
post '/webhooks/whatsapp' do
  payload = request.body.read
  result = $whatsapp_webhook.process_message(payload)
  status result[:status]
  content_type :json
  { status: result[:body] }.to_json
end

# Helper methods

# Validate booking input for malicious payloads
def validate_booking_input(params)
  # Check for SQL injection patterns - ENHANCED to catch more attack vectors
  sql_patterns = [
    # Time-based injections
    /(\bwaitfor\b|\bdelay\b|\bsleep\b|\bbenchmark\b)/i,
    # SELECT/FROM patterns (with or without spaces/parentheses)
    /select.*from/i,
    /select\s*\(.*\)/i,
    /\(select/i,
    # UNION injections
    /union.*select/i,
    # Boolean-based injections (various forms)
    /(\bor\b|\band\b)\s*['"]?\d+/i,
    /['"]?\d+\s*=\s*['"]?\d+/i,
    /\d+\s*(=|!=|<>)\s*\d+/i,
    # Common SQL keywords
    /(\bdrop\b|\bdelete\b|\binsert\b|\bupdate\b|\bexec\b|\bexecute\b)/i,
    # SQL comments and special characters
    /(--|#|\/\*|\*\/|;)/,
    # SQL system procedures
    /(xp_|sp_|@@)/i,
    # Hex/char encoding attempts
    /(0x[0-9a-f]+|char\()/i
  ]

  # Check for XSS patterns
  xss_patterns = [
    /<script\b/i,
    /<\/script>/i,
    /javascript:/i,
    /on\w+\s*=/i,  # Event handlers like onclick=, onerror=
    /<iframe\b/i,
    /<embed\b/i,
    /<object\b/i,
    /eval\s*\(/i,
    /expression\s*\(/i
  ]

  # Fields to validate with length limits
  text_fields = {
    'name' => 100,
    'email' => 255,
    'phone_number' => 30,
    'custom_occupation' => 200,
    'custom_goal' => 500,
    'tiktok_username' => 100,
    'instagram_username' => 100,
    'youtube_username' => 100
  }

  text_fields.each do |field, max_length|
    value = params[field]
    next if value.nil? || value.to_s.empty?

    value_str = value.to_s

    # Check length limits
    if value_str.length > max_length
      return { valid: false, reason: "Input too long in #{field}" }
    end

    # Check for excessive special characters (likely injection attempt)
    special_char_count = value_str.scan(/[^a-zA-Z0-9\s@._\-\+\(\)]/).length
    if special_char_count > 10
      return { valid: false, reason: "Invalid characters in #{field}" }
    end

    # Check SQL injection
    sql_patterns.each do |pattern|
      if value_str.match?(pattern)
        return { valid: false, reason: "Invalid input detected in #{field}" }
      end
    end

    # Check XSS
    xss_patterns.each do |pattern|
      if value_str.match?(pattern)
        return { valid: false, reason: "Invalid input detected in #{field}" }
      end
    end
  end

  # Email format validation (strict)
  email = params['email']
  if email && !email.to_s.empty?
    email_str = email.to_s
    # Check for valid email format - must have exactly one @, valid characters
    unless email_str.match?(/\A[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\z/)
      return { valid: false, reason: "Invalid email format" }
    end
    # Additional check: no SQL keywords in email
    if email_str.match?(/\b(select|union|drop|insert|delete|script)\b/i)
      return { valid: false, reason: "Invalid email format" }
    end
  end

  # Phone number validation (strict - allow only digits, spaces, +, -, ())
  phone = params['phone_number']
  if phone && !phone.to_s.empty?
    phone_str = phone.to_s
    unless phone_str.match?(/\A[\d\s\+\-\(\)]+\z/)
      return { valid: false, reason: "Invalid phone number format" }
    end
    # Phone should have at least 7 digits
    digit_count = phone_str.scan(/\d/).length
    if digit_count < 7
      return { valid: false, reason: "Invalid phone number" }
    end
  end

  # Validate budget/goal selection (must be from allowed list)
  budget = params['budget']
  if budget && !budget.empty?
    allowed_budgets = ['save_time', 'improve_quality', 'exploring', 'other']
    unless allowed_budgets.include?(budget)
      return { valid: false, reason: "Invalid selection" }
    end
  end

  { valid: true }
end

def send_notification_email(booking_data)
  begin
    # Format social media info
    social_info = ""
    if booking_data[:social_platforms] && !booking_data[:social_platforms].empty?
      social_info = "\n\nSelected Platforms:"
      booking_data[:social_platforms].each do |platform|
        username = booking_data[:social_usernames][platform]
        if username && !username.empty?
          platform_name = platform.capitalize
          social_info += "\n#{platform_name}: @#{username}"
        else
          social_info += "\n#{platform.capitalize}: Username not specified"
        end
      end
    else
      social_info = "\nNo platforms selected yet"
    end
    
    mail = Mail.new do
      from     'hello@amoredit.com'
      to       ['cem@amoredit.com', 'onur@amoredit.com', 'hello@amoredit.com']
      subject  "Amoredit Booking - #{booking_data[:name]}"
      body     <<~EMAIL
        New booking received!

        Name: #{booking_data[:name]}
        Email: #{booking_data[:email]}
        Phone: #{booking_data[:phone_number]}
        Occupation: #{booking_data[:occupation]}#{social_info}

        Please contact this person.
      EMAIL
    end
    
    mail.deliver!
    true
  rescue => e
    false
  end
end

def send_customer_confirmation_email(booking_data)
  begin
    language = booking_data[:language] || 'en'

    # Multilingual content
    subjects = {
      'en' => "Your Amoredit Booking is Confirmed",
      'it' => "La Tua Prenotazione Amoredit è Confermata"
    }

    greetings = {
      'en' => "Hi #{booking_data[:name]}!",
      'it' => "Ciao #{booking_data[:name]}!"
    }

    confirmations = {
      'en' => "Your booking has been successfully received. Our team will contact you soon during our working hours.",
      'it' => "La tua prenotazione è stata ricevuta con successo. Il nostro team ti contatterà presto durante il nostro orario di lavoro."
    }

    contact_info = {
      'en' => "If you have any questions, you can reach us at hello@amoredit.com.",
      'it' => "Se hai domande, puoi contattarci all'indirizzo hello@amoredit.com."
    }

    signatures = {
      'en' => "Amoredit Team",
      'it' => "Team Amoredit"
    }

    mail = Mail.new do
      from     'hello@amoredit.com'
      to       booking_data[:email]
      subject  subjects[language]
      body     <<~EMAIL
        #{greetings[language]}

        #{confirmations[language]}

        #{contact_info[language]}

        #{signatures[language]}
      EMAIL
    end

    mail.deliver!
    true
  rescue => e
    false
  end
end

# Facebook event tracking helper
def track_facebook_event(event_name, request, additional_data = {})
  return unless $fb_tracker

  # Extract real client IP from Cloudflare headers (critical for EMQ)
  client_ip = request.env['HTTP_CF_CONNECTING_IP'] ||
              request.env['HTTP_X_FORWARDED_FOR']&.split(',')&.first&.strip ||
              request.ip

  # Try Cloudflare headers first (fastest), then fallback to GeoIP lookup
  country = request.env['HTTP_CF_IPCOUNTRY'] # 2-letter country code from Cloudflare
  city = nil
  state = nil
  zip_code = nil

  # If Cloudflare doesn't provide country, or we need city/state/zip, use GeoIP
  if !country || country.empty?
    geo_data = $geoip.lookup(client_ip)
    if geo_data
      country ||= geo_data[:country]
      city = geo_data[:city]
      state = geo_data[:state]
      zip_code = geo_data[:zip]
    end
  else
    # We have country from Cloudflare, but get city/state/zip from GeoIP
    geo_data = $geoip.lookup(client_ip)
    if geo_data
      city = geo_data[:city]
      state = geo_data[:state]
      zip_code = geo_data[:zip]
    end
  end

  event_data = {
    event_name: event_name,
    source_url: request.url,
    user_agent: request.user_agent,
    client_ip: client_ip, # Real user IP (required for high EMQ)
    country: country, # Will be normalized and hashed in FacebookTracker
    city: city, # Will be normalized and hashed
    state: state, # Will be normalized and hashed
    zip_code: zip_code, # Will be normalized and hashed
    fbc: extract_fbc_from_request(request), # Click ID from Meta ads
    fbp: extract_fbp_from_request(request) # Browser ID from Meta Pixel
  }.merge(additional_data)

  $fb_tracker.track_event(event_data)
rescue => e
end

def extract_fbc_from_request(request)
  # Try to get fbc from various sources (priority order for EMQ)
  fbc = request.cookies['_fbc'] ||
        request.params['fbc'] ||
        extract_fbclid_from_url(request)

  fbc
end

def extract_fbp_from_request(request)
  request.cookies['_fbp'] || request.params['fbp']
end

def extract_fbclid_from_url(request)
  # Extract fbclid from URL and format as fbc cookie
  fbclid = request.params['fbclid']
  return nil unless fbclid

  # Format: fb.{subdomain}.{timestamp}.{fbclid}
  subdomain = request.host.split('.').first || 'www'
  timestamp = Time.now.to_i * 1000
  "fb.#{subdomain}.#{timestamp}.#{fbclid}"
end

def extract_first_name(full_name)
  return nil unless full_name
  full_name.split(' ').first
end

def extract_last_name(full_name)
  return nil unless full_name
  parts = full_name.split(' ')
  parts.length > 1 ? parts[1..-1].join(' ') : nil
end

# reCAPTCHA verification helper with enhanced security validation
def verify_recaptcha(token)
  begin
    secret_key = ENV['RECAPTCHA_SECRET_KEY']
    return nil unless secret_key

    uri = URI.parse('https://www.google.com/recaptcha/api/siteverify')
    request = Net::HTTP::Post.new(uri)
    request.set_form_data(
      'secret' => secret_key,
      'response' => token
    )

    response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
      http.request(request)
    end

    result = JSON.parse(response.body)

    if result['success']
      score = result['score']
      hostname = result['hostname']
      action = result['action']
      challenge_ts = result['challenge_ts']

      # Validate hostname (must be from your domain)
      valid_hostnames = ['amoredit.com', 'www.amoredit.com', 'localhost']
      unless valid_hostnames.include?(hostname)
        return 0.0
      end

      # Validate action (must match expected action)
      unless action == 'submit'
        return 0.0
      end

      # Validate timestamp (token should be recent - within 2 minutes)
      if challenge_ts
        challenge_time = Time.parse(challenge_ts)
        age_seconds = Time.now - challenge_time
        if age_seconds > 120 # 2 minutes  
          return 0.0
        end
      end

      return score
    else
      return 0.0
    end
  rescue => e
    return nil
  end
end
