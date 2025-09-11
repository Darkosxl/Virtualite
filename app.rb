require 'sinatra'
require 'sinatra/json'
require 'json'
require 'mail'
require_relative 'database'

# Configuration
set :public_folder, 'public'
set :port, 4567
set :bind, '0.0.0.0'
set :sessions, true

# Database initialization
$db = Database.new

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

# Submit booking directly - no verification needed
post '/submit-booking' do
  phone_number = params['phone_number']
  name = params['name']
  selected_date = params['selected_date']
  selected_time = params['selected_time']
  
  # Handle multiple social platforms
  social_platforms = params['social_platforms[]'] || []
  social_usernames = {}
  social_platforms.each do |platform|
    username = params["#{platform}_username"]
    social_usernames[platform] = username if username && !username.empty?
  end
  
  booking_data = {
    name: name,
    phone_number: phone_number,
    selected_date: selected_date,
    selected_time: selected_time,
    social_platforms: social_platforms,
    social_usernames: social_usernames
  }
  
  # Save to database
  booking_id = $db.save_booking(booking_data)
  
  # Send notification email
  email_success = send_notification_email(booking_data)
  
  if booking_id && email_success
    erb :success_message
  else
    status 500
    erb :error_message, locals: { message: "Rezervasyon kaydedilemedi. Lütfen tekrar deneyin." }
  end
end

# Helper methods

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
