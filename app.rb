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

# Configuration
set :public_folder, 'public'
set :port, ENV['PORT'] || 4568
set :bind, '0.0.0.0'
set :sessions, true
set :host_authorization, { permitted_hosts: [] }
# Production optimizations
configure :production do
  set :server, :puma
  

  # Enable gzip compression
  use Rack::Deflater
  set :host_authorization, { permitted_hosts: ["amoredit.com"] }
  # Serve static files efficiently
  set :static_cache_control, [:public, max_age: 31536000]
end

# Initialize components
$db = Database.new
$fb_tracker = FacebookTracker.new
$google_sheets = GoogleSheetsIntegration.new
configure :development do
  set :host_authorization, { permitted_hosts: [] }
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
  puts "Mail configuration successful"
rescue => e
  puts "Mail configuration error: #{e.message}"
end

# Routes
get '/' do
  # Track website visit
  track_facebook_event('Website_Visit', request, {
    custom_data: {
      page: 'homepage',
      referrer: request.referrer
    }
  })

  send_file File.join('public', 'index.html')
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

# Check available time slots for a specific date
get '/api/available-slots/:date' do
  content_type :json

  date = params[:date]

  # Get existing bookings for this date
  existing_bookings = $db.get_bookings_for_date(date)

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
# Social media fields partial - no longer needed but keeping for compatibility
get '/social-fields' do
  # Return empty content since we now handle platforms directly in the form
  ""
end

# Submit booking with bot protection
post '/submit-booking' do
  # Track form start
  track_facebook_event('Form_Start', request, {
    custom_data: {
      selected_date: params['selected_date'],
      selected_time: params['selected_time']
    }
  })
  # Bot protection checks
  honeypot_value = params['user_nickname']
  load_time = params['load_time']
  
  # 1. Check the Honeypot
  if honeypot_value && !honeypot_value.empty?
    # It's a bot. Block this IP for 20 minutes.
    puts "BOT DETECTED: Honeypot filled by IP #{request.ip}"
    status 429
    halt "Bot detected"
  end
  
  # 2. Check the Time (must be at least 4 seconds)
  if load_time && !load_time.empty?
    submission_time = Time.now.to_f * 1000  # Convert to milliseconds
    time_difference = submission_time - load_time.to_f
    
    if time_difference < 4000  # Less than 4 seconds
      puts "BOT DETECTED: Too fast submission (#{time_difference}ms) by IP #{request.ip}"
      status 429
      halt "Submission too fast"
    end
  end
  
  # 3. Check reCAPTCHA (if token is present)
  recaptcha_token = params['g-recaptcha-response']
  if recaptcha_token && !recaptcha_token.empty?
    recaptcha_score = verify_recaptcha(recaptcha_token)
    
    # Only block if we got a valid score that's too low
    # Don't block if verification failed due to technical issues (nil return)
    if recaptcha_score && recaptcha_score.is_a?(Numeric) && recaptcha_score < 0.5
      puts "BOT DETECTED: Low reCAPTCHA score (#{recaptcha_score}) by IP #{request.ip}"
      status 429
      halt "reCAPTCHA verification failed"
    elsif recaptcha_score.nil?
      # reCAPTCHA verification failed due to technical issues - allow booking to proceed
      puts "reCAPTCHA verification failed (technical issue) - allowing booking to proceed for IP #{request.ip}"
    end
  end
  
  phone_number = params['phone_number']
  name = params['name']
  email = params['email']
  language = params['language'] || 'tr'
  selected_date = params['selected_date']
  selected_time = params['selected_time']

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
  puts "DEBUG - All params: #{params.inspect}"
  puts "DEBUG - social_platforms: #{social_platforms.inspect}"
  
  social_platforms.each do |platform|
    username = params["#{platform}_username"]
    puts "DEBUG - Platform: #{platform}, Username: #{username}"
    social_usernames[platform] = username if username && !username.empty?
  end
  
  puts "DEBUG - Final social_usernames: #{social_usernames.inspect}"
  
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
  if !sheets_result[:success]
    puts "Google Sheets sync failed: #{sheets_result[:error]}"
  end
  
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
        selected_date: booking_data[:selected_date],
        selected_time: booking_data[:selected_time],
        occupation: booking_data[:occupation],
        social_platforms: booking_data[:social_platforms]&.join(',')
      }
    })

    # Log customer email status
    if customer_email_success
      puts "Customer confirmation email sent successfully"
    else
      puts "Warning: Customer confirmation email failed to send"
    end

    erb :success_message, locals: {
      booking_id: booking_id,
      email: booking_data[:email],
      phone: booking_data[:phone_number]
    }
  else
    status 500
    erb :error_message, locals: { message: "Rezervasyon kaydedilemedi. Lütfen tekrar deneyin." }
  end
end

# Track calendar view event
post '/track/calendar-view' do
  track_facebook_event('Calendar_View', request, {
    custom_data: {
      action: 'calendar_viewed',
      page_section: 'booking'
    }
  })

  { success: true }.to_json
end

# Track date selection event
post '/track/date-select' do
  selected_date = params['selected_date']

  track_facebook_event('Date_Select', request, {
    custom_data: {
      selected_date: selected_date,
      action: 'date_selected'
    }
  })

  { success: true }.to_json
end

# Track time slot selection event
post '/track/time-select' do
  selected_time = params['selected_time']
  selected_date = params['selected_date']

  track_facebook_event('Time_Select', request, {
    custom_data: {
      selected_date: selected_date,
      selected_time: selected_time,
      action: 'time_selected'
    }
  })

  { success: true }.to_json
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
    puts "Facebook tracking error: #{e.message}"
    status 500
    { error: 'Server error' }.to_json
  end
end

# Helper methods

def send_notification_email(booking_data)
  begin
    # Format social media info
    social_info = ""
    if booking_data[:social_platforms] && !booking_data[:social_platforms].empty?
      social_info = "\n\nSeçilen Platformlar:"
      booking_data[:social_platforms].each do |platform|
        username = booking_data[:social_usernames][platform]
        if username && !username.empty?
          platform_name = platform.capitalize
          social_info += "\n#{platform_name}: @#{username}"
        else
          social_info += "\n#{platform.capitalize}: Kullanıcı adı belirtilmemiş"
        end
      end
    else
      social_info = "\nHenüz platform seçimi yapılmamış"
    end
    
    mail = Mail.new do
      from     'hello@amoredit.com'
      to       ['cem@amoredit.com', 'onur@amoredit.com', 'hello@amoredit.com']
      subject  "Amoredit Rezervasyon - #{booking_data[:name]}"
      body     <<~EMAIL
        Yeni bir rezervasyon alındı!

        İsim: #{booking_data[:name]}
        E-posta: #{booking_data[:email]}
        Telefon: #{booking_data[:phone_number]}
        Meslek: #{booking_data[:occupation]}
        Tarih: #{booking_data[:selected_date]}
        Saat: #{booking_data[:selected_time]}#{social_info}

        Lütfen bu kişi ile iletişime geçin.
      EMAIL
    end
    
    mail.deliver!
    puts "Notification email sent successfully"
    true
  rescue => e
    puts "Email error: #{e.message}"
    puts "ENV['GMAIL_USERNAME']: #{ENV['GMAIL_USERNAME']}"
    puts "ENV['GMAIL_PASSWORD']: #{ENV['GMAIL_PASSWORD'] ? '[SET]' : '[NOT SET]'}"
    false
  end
end

def send_customer_confirmation_email(booking_data)
  begin
    language = booking_data[:language] || 'tr'

    # Multilingual content
    subjects = {
      'tr' => "Amoredit Rezervasyonunuz Onaylandı",
      'en' => "Your Amoredit Booking is Confirmed",
      'it' => "La Tua Prenotazione Amoredit è Confermata"
    }

    greetings = {
      'tr' => "Selam #{booking_data[:name]}!",
      'en' => "Hi #{booking_data[:name]}!",
      'it' => "Ciao #{booking_data[:name]}!"
    }

    confirmations = {
      'tr' => "Rezervasyonunuz başarıyla alındı. Ekibimiz rezervasyon saatinizde sizinle iletişime geçecek.",
      'en' => "Your booking has been successfully received. Our team will contact you at your booking time.",
      'it' => "La tua prenotazione è stata ricevuta con successo. Il nostro team ti contatterà all'orario della tua prenotazione."
    }

    booking_details = {
      'tr' => "Rezervasyon Detayları:",
      'en' => "Booking Details:",
      'it' => "Dettagli della Prenotazione:"
    }

    date_labels = {
      'tr' => "Tarih",
      'en' => "Date",
      'it' => "Data"
    }

    time_labels = {
      'tr' => "Saat",
      'en' => "Time",
      'it' => "Ora"
    }

    contact_info = {
      'tr' => "Herhangi bir sorunuz varsa, hello@amoredit.com adresinden bize ulaşabilirsiniz.",
      'en' => "If you have any questions, you can reach us at hello@amoredit.com.",
      'it' => "Se hai domande, puoi contattarci all'indirizzo hello@amoredit.com."
    }

    signatures = {
      'tr' => "Amoredit Ekibi",
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

        #{booking_details[language]}
        #{date_labels[language]}: #{booking_data[:selected_date]}
        #{time_labels[language]}: #{booking_data[:selected_time]}

        #{contact_info[language]}

        #{signatures[language]}
      EMAIL
    end

    mail.deliver!
    puts "Customer confirmation email sent successfully to #{booking_data[:email]}"
    true
  rescue => e
    puts "Customer email error: #{e.message}"
    false
  end
end

# Facebook event tracking helper
def track_facebook_event(event_name, request, additional_data = {})
  return unless $fb_tracker

  event_data = {
    event_name: event_name,
    source_url: request.url,
    user_agent: request.user_agent,
    client_ip: request.ip,
    fbc: extract_fbc_from_request(request),
    fbp: extract_fbp_from_request(request)
  }.merge(additional_data)

  $fb_tracker.track_event(event_data)
rescue => e
  puts "Facebook tracking error for #{event_name}: #{e.message}"
end

def extract_fbc_from_request(request)
  # Try to get fbc from various sources (priority order for EMQ)
  fbc = request.cookies['_fbc'] ||
        request.params['fbc'] ||
        extract_fbclid_from_url(request)

  # Log for debugging EMQ issues
  puts "FBC extracted: #{fbc ? 'YES' : 'NO'} from #{request.url}" if ENV['RACK_ENV'] == 'development'
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

# reCAPTCHA verification helper
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
      puts "reCAPTCHA verification successful. Score: #{score}"
      return score
    else
      puts "reCAPTCHA verification failed: #{result['error-codes']}"
      return 0.0
    end
  rescue => e
    puts "reCAPTCHA verification error: #{e.message}"
    return nil
  end
end
