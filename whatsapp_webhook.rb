require 'net/http'
require 'uri'
require 'json'
require 'logger'

class WhatsAppWebhook
  def initialize(database, facebook_tracker)
    @verify_token = ENV['WHATSAPP_VERIFY_TOKEN']
    @phone_number_id = ENV['WHATSAPP_PHONE_NUMBER_ID']
    @access_token = ENV['WHATSAPP_ACCESS_TOKEN']
    @db = database
    @fb_tracker = facebook_tracker
    @logger = Logger.new(STDOUT)
    @logger.level = Logger::INFO
  end

  # Webhook verification - Meta calls this to verify your endpoint
  def verify_webhook(params)
    mode = params['hub.mode']
    token = params['hub.verify_token']
    challenge = params['hub.challenge']

    if mode == 'subscribe' && token == @verify_token
      @logger.info("✅ WhatsApp webhook verified successfully")
      return { status: 200, body: challenge }
    else
      @logger.warn("⚠️  WhatsApp webhook verification failed")
      return { status: 403, body: 'Forbidden' }
    end
  end

  # Process incoming WhatsApp message
  def process_message(payload)
    @logger.info("📨 WhatsApp webhook received: #{payload.inspect}")

    begin
      # Parse the WhatsApp Cloud API webhook payload
      data = JSON.parse(payload)

      # Extract the message data from the nested structure
      entry = data['entry']&.first
      return { status: 200, body: 'No entry data' } unless entry

      changes = entry['changes']&.first
      return { status: 200, body: 'No changes data' } unless changes

      value = changes['value']
      return { status: 200, body: 'No value data' } unless value

      # Check if this is a message notification (not status update)
      messages = value['messages']
      return { status: 200, body: 'No messages' } unless messages && !messages.empty?

      message = messages.first
      contacts = value['contacts']&.first

      # Extract user data
      phone_number = message['from'] # User's phone number in international format
      message_text = message['text']&.dig('body') || ''
      message_timestamp = message['timestamp']
      user_name = contacts&.dig('profile', 'name') || 'WhatsApp User'

      @logger.info("📞 Message from: #{phone_number} (#{user_name})")
      @logger.info("💬 Message: #{message_text}")

      # Check if this is a first-time message (deduplication)
      is_first_message = @db.is_first_whatsapp_message?(phone_number)

      if is_first_message
        @logger.info("🎯 First-time WhatsApp message detected - tracking conversion")

        # Save WhatsApp contact to database
        whatsapp_contact_id = @db.save_whatsapp_contact({
          phone_number: phone_number,
          name: user_name,
          first_message: message_text,
          message_timestamp: Time.at(message_timestamp.to_i)
        })

        # Track Facebook conversion event
        track_whatsapp_conversion(phone_number, user_name, whatsapp_contact_id)
      else
        @logger.info("♻️  Returning user - skipping conversion tracking")
      end

      { status: 200, body: 'EVENT_RECEIVED' }
    rescue JSON::ParserError => e
      @logger.error("❌ JSON parse error: #{e.message}")
      { status: 400, body: 'Invalid JSON' }
    rescue => e
      @logger.error("❌ WhatsApp webhook processing error: #{e.message}")
      @logger.error(e.backtrace.join("\n"))
      { status: 500, body: 'Internal error' }
    end
  end

  private

  def track_whatsapp_conversion(phone_number, user_name, whatsapp_contact_id)
    return unless @fb_tracker

    # Split name into first and last name (best effort)
    name_parts = user_name.split(' ')
    first_name = name_parts.first
    last_name = name_parts.length > 1 ? name_parts[1..-1].join(' ') : nil

    event_data = {
      event_name: 'Booking_Complete',
      event_time: Time.now.to_i,
      action_source: 'website',
      event_source_url: 'https://amoredit.com/whatsapp',
      phone: phone_number,
      first_name: first_name,
      last_name: last_name,
      external_id: whatsapp_contact_id.to_s,
      custom_data: {
        source: 'whatsapp_message',
        whatsapp_contact_id: whatsapp_contact_id,
        lead_type: 'whatsapp_direct'
      }
    }

    result = @fb_tracker.track_event(event_data)

    if result[:success]
      @logger.info("✅ Facebook conversion tracked for WhatsApp message")
    else
      @logger.error("❌ Facebook conversion tracking failed: #{result[:error]}")
    end
  rescue => e
    @logger.error("❌ WhatsApp conversion tracking error: #{e.message}")
  end
end
