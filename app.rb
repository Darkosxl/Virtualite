require 'sinatra'
require 'sinatra/json'
require 'json'
require 'net/http'
require 'uri'
require 'mail'
require 'securerandom'

# Configuration
set :public_folder, 'public'
set :port, 4567
set :bind, '0.0.0.0'
set :sessions, true

# In-memory storage for verification codes (use Redis in production)
$verification_codes = {}

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

# Booking form step 1 - Contact details
get '/booking-form' do
  selected_date = params['selected_date']
  selected_time = params['selected_time']
  
  erb :booking_form, locals: { 
    selected_date: selected_date, 
    selected_time: selected_time 
  }
end

# Social media fields partial
get '/social-fields' do
  has_content = params['has_content'] == 'true'
  erb :social_fields, locals: { has_content: has_content }
end

# Phone verification - generates and sends SMS code
post '/verify-phone' do
  content_type :json
  
  phone_number = params['phone_number']
  name = params['name']
  selected_date = params['selected_date']
  selected_time = params['selected_time']
  has_content = params['has_content'] == 'true'
  social_platform = params['social_platform']
  social_id = params['social_id']
  
  # Generate 6-digit code
  verification_code = sprintf('%06d', rand(1000000))
  
  # Store in session (in production, use Redis with expiry)
  session[:verification_code] = verification_code
  session[:phone_number] = phone_number
  session[:booking_data] = {
    name: name,
    phone_number: phone_number,
    selected_date: selected_date,
    selected_time: selected_time,
    has_content: has_content,
    social_platform: social_platform,
    social_id: social_id
  }
  
  # Send SMS (mock for now - in production use Twilio/SMS API)
  success = send_sms(phone_number, "doğrulama kodunuz: #{verification_code}")
  
  if success
    # Return the verification form as HTML
    erb :verification_form, locals: { phone_number: phone_number }
  else
    status 500
    erb :error_message, locals: { message: "SMS gönderilemedi. Lütfen tekrar deneyin." }
  end
end

# Submit booking after SMS verification
post '/submit-booking' do
  content_type :json
  
  user_code = params['verification_code']
  stored_code = session[:verification_code]
  
  unless user_code == stored_code
    status 400
    return json({ success: false, message: "Doğrulama kodu hatalı!" })
  end
  
  booking_data = session[:booking_data]
  
  # Send notification email
  success = send_notification_email(booking_data)
  
  # Clear session
  session[:verification_code] = nil
  session[:booking_data] = nil
  
  if success
    erb :success_message
  else
    status 500
    erb :error_message, locals: { message: "Email gönderilemedi. Lütfen tekrar deneyin." }
  end
end

# Helper methods
def send_sms(phone_number, message)
  # Mock SMS sending - replace with real SMS API (Twilio, etc.)
  puts "SMS sent to #{phone_number}: #{message}"
  true
  
  # Example Twilio integration (uncomment and configure):
  # begin
  #   require 'twilio-ruby'
  #   client = Twilio::REST::Client.new('your_account_sid', 'your_auth_token')
  #   client.messages.create(
  #     from: 'your_twilio_number',
  #     to: phone_number,
  #     body: message
  #   )
  #   true
  # rescue => e
  #   puts "SMS error: #{e.message}"
  #   false
  # end
end

def send_notification_email(booking_data)
  begin
    Mail.configure do |config|
      config.delivery_method = :smtp, {
        address: 'smtp.gmail.com',
        port: 587,
        domain: 'gmail.com',
        user_name: ENV['GMAIL_USERNAME'] || 'your-email@gmail.com',
        password: ENV['GMAIL_PASSWORD'] || 'your-app-password',
        authentication: 'plain',
        enable_starttls_auto: true
      }
    end
    
    social_info = booking_data[:has_content] ? 
      "\nSosyal Medya: #{booking_data[:social_platform]} - @#{booking_data[:social_id]}" : 
      "\nDaha önce içerik üretmemiş"
    
    mail = Mail.new do
      from     ENV['GMAIL_USERNAME'] || 'your-email@gmail.com'
      to       'bscemarslan@gmail.com'
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
    false
  end
end
