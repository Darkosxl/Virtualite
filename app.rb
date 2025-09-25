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
      address: 'smtp.gmail.com',
      port: 587,
      domain: 'gmail.com',
      user_name: ENV['GMAIL_USERNAME'],
      password: ENV['GMAIL_PASSWORD'],
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

# Booking form step 1 - Contact details
get '/booking-form' do
  selected_date = params['selected_date']
  selected_time = params['selected_time']
  
  erb :booking_form, locals: { 
    selected_date: selected_date, 
    selected_time: selected_time 
  }
end

# Social media fields partial - no longer needed but keeping for compatibility
get '/social-fields' do
  # Return empty content since we now handle platforms directly in the form
  ""
end

# Submit booking with bot protection
post '/submit-booking' do
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
  selected_date = params['selected_date']
  selected_time = params['selected_time']

  # Handle occupation selection
  occupation = params['occupation']
  custom_occupation = params['custom_occupation']
  final_occupation = (occupation == 'custom' && custom_occupation && !custom_occupation.empty?) ? custom_occupation : occupation

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
    selected_date: selected_date,
    selected_time: selected_time,
    occupation: final_occupation,
    social_platforms: social_platforms,
    social_usernames: social_usernames
  }
  
  # Save to database
  booking_id = $db.save_booking(booking_data)

  # Send notification email
  email_success = send_notification_email(booking_data)

  # Add to Google Sheets
  sheets_result = $google_sheets.add_booking_to_sheet(booking_data)
  if !sheets_result[:success]
    puts "Google Sheets sync failed: #{sheets_result[:error]}"
  end
  
  if booking_id && email_success
    erb :success_message, locals: { 
      booking_id: booking_id,
      email: booking_data[:phone_number], # We'll use phone as identifier since we don't collect email
      phone: booking_data[:phone_number]
    }
  else
    status 500
    erb :error_message, locals: { message: "Rezervasyon kaydedilemedi. Lütfen tekrar deneyin." }
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
      from     ENV['GMAIL_USERNAME']
      to       ['bscemarslan@gmail.com', 'onur5celik8@gmail.com']
      subject  'Yeni Rezervasyon - Virtualite'
      body     <<~EMAIL
        Yeni bir rezervasyon alındı!
        
        İsim: #{booking_data[:name]}
        Telefon: #{booking_data[:phone_number]}
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
