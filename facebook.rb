require 'net/http'
require 'uri'
require 'json'
require 'digest'

class FacebookTracker
  def initialize
    @pixel_id = ENV['META_PIXEL_ID']
    @access_token = ENV['META_ACCESS_TOKEN']
    @api_url = "https://graph.facebook.com/v18.0/#{@pixel_id}/events"
  end

  def track_event(event_data)
    return { error: 'Missing Facebook credentials' } unless @pixel_id && @access_token
    
    # Hash sensitive user data for privacy
    hashed_email = event_data[:email] ? hash_data(event_data[:email].strip.downcase) : nil
    hashed_phone = event_data[:phone] ? hash_data(event_data[:phone].gsub(/\D/, '')) : nil
    
    payload = {
      data: [{
        event_name: event_data[:event_name],
        event_time: Time.now.to_i,
        event_id: event_data[:event_id],
        action_source: 'website',
        event_source_url: event_data[:source_url],
        user_data: {
          em: hashed_email ? [hashed_email] : nil,
          ph: hashed_phone ? [hashed_phone] : nil,
          client_user_agent: event_data[:user_agent],
          fbc: event_data[:fbc],
          fbp: event_data[:fbp]
        }.compact,
        custom_data: event_data[:custom_data] || {}
      }]
    }
    
    send_to_facebook(payload)
  end

  private

  def hash_data(data)
    Digest::SHA256.hexdigest(data)
  end

  def send_to_facebook(payload)
    uri = URI("#{@api_url}?access_token=#{@access_token}")
    
    response = Net::HTTP.post(
      uri,
      payload.to_json,
      { 'Content-Type' => 'application/json' }
    )
    
    puts "Facebook Conversions API: #{response.code} - #{response.body}"
    
    {
      status: response.code.to_i,
      body: JSON.parse(response.body)
    }
  rescue => e
    puts "Facebook tracking error: #{e.message}"
    { error: e.message }
  end
end