require 'net/http'
require 'uri'
require 'json'
require 'digest'
require 'securerandom'
require 'logger'

class FacebookTracker
  def initialize
    @pixel_id = ENV['META_PIXEL_ID']
    @access_token = ENV['META_ACCESS_TOKEN']
    @test_event_code = ENV['META_TEST_EVENT_CODE']
    @api_url = "https://graph.facebook.com/v21.0/#{@pixel_id}/events"
    @logger = Logger.new(STDOUT)
    @logger.level = Logger::INFO
  end

  def track_event(event_data)
    return { error: 'Missing Facebook credentials' } unless @pixel_id && @access_token

    request_id = SecureRandom.hex(8)
    @logger.info("[#{request_id}] 📊 Tracking event: #{event_data[:event_name]}")

    # Hash sensitive user data for privacy
    hashed_email = event_data[:email] ? hash_data(event_data[:email].strip.downcase) : nil
    hashed_phone = event_data[:phone] ? hash_data(normalize_phone(event_data[:phone])) : nil
    hashed_first_name = event_data[:first_name] ? hash_data(event_data[:first_name].strip.downcase) : nil
    hashed_last_name = event_data[:last_name] ? hash_data(event_data[:last_name].strip.downcase) : nil
    hashed_external_id = event_data[:external_id] ? hash_data(event_data[:external_id]) : nil

    # Hash geographic data (normalize then hash per Meta's requirements)
    hashed_city = event_data[:city] ? hash_data(normalize_text(event_data[:city])) : nil
    hashed_country = event_data[:country] ? hash_data(normalize_text(event_data[:country])) : hash_data('tr') # Default to Turkey
    hashed_state = event_data[:state] ? hash_data(normalize_text(event_data[:state])) : nil
    hashed_zip = event_data[:zip_code] ? hash_data(normalize_text(event_data[:zip_code])) : nil

    user_data = {
      em: hashed_email,
      ph: hashed_phone,
      fn: hashed_first_name,
      ln: hashed_last_name,
      external_id: hashed_external_id,
      client_ip_address: event_data[:client_ip], # Required for high EMQ
      client_user_agent: event_data[:user_agent], # Required for website events
      fbp: event_data[:fbp], # _fbp cookie (not hashed)
      fbc: event_data[:fbc], # _fbc cookie (not hashed)
      ct: hashed_city,
      country: hashed_country,
      st: hashed_state,
      zp: hashed_zip
    }.compact

    payload = {
      data: [{
        event_name: event_data[:event_name],
        event_time: event_data[:event_time] || Time.now.to_i,
        event_id: event_data[:event_id] || SecureRandom.uuid,
        action_source: 'website',
        event_source_url: event_data[:source_url],
        user_data: user_data,
        custom_data: event_data[:custom_data] || {}
      }]
    }

    # Add test event code if available (for testing)
    payload[:test_event_code] = @test_event_code if @test_event_code && !@test_event_code.empty?

    @logger.info("[#{request_id}] ⬆️  Sending to Meta: #{payload.to_json}")
    result = send_to_facebook(payload, request_id)
    @logger.info("[#{request_id}] ✅ Meta response: #{result}")

    result
  end

  private

  def hash_data(data)
    return nil unless data && !data.to_s.empty?
    Digest::SHA256.hexdigest(data.to_s.strip)
  end

  def normalize_text(text)
    # Normalize text per Meta's requirements: lowercase, trim, remove punctuation/spaces
    return nil unless text && !text.to_s.empty?
    text.to_s.strip.downcase.gsub(/[^a-z0-9]/, '')
  end

  def normalize_phone(phone)
    return nil unless phone
    # Remove all non-digits
    digits = phone.gsub(/\D/, '')
    # For Turkey: if starts with 0, replace with 90
    if digits.start_with?('0') && digits.length == 11
      digits = '90' + digits[1..-1]
    end
    digits
  end

  def send_to_facebook(payload, request_id = nil)
    uri = URI("#{@api_url}?access_token=#{@access_token}")

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.read_timeout = 10
    http.open_timeout = 5

    request = Net::HTTP::Post.new(uri)
    request['Content-Type'] = 'application/json'
    request['User-Agent'] = 'Influencer-Landing-CAPI/1.0'
    request.body = payload.to_json

    response = http.request(request)

    @logger.info("[#{request_id}] Facebook CAPI: #{response.code} - #{response.body}")

    {
      status: response.code.to_i,
      body: JSON.parse(response.body),
      success: response.code.to_i == 200
    }
  rescue JSON::ParserError => e
    @logger.error("[#{request_id}] JSON parse error: #{e.message}")
    { error: "Invalid JSON response: #{e.message}", success: false }
  rescue Net::TimeoutError => e
    @logger.error("[#{request_id}] Timeout error: #{e.message}")
    { error: "Request timeout: #{e.message}", success: false }
  rescue => e
    @logger.error("[#{request_id}] Facebook tracking error: #{e.message}")
    { error: e.message, success: false }
  end
end