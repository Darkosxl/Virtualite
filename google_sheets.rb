require 'google_drive'
require 'json'
require 'stringio'
require 'base64'

class GoogleSheetsIntegration
  def initialize
    @spreadsheet_id = ENV['GOOGLE_SHEETS_ID']
    @service_account_b64 = ENV['GOOGLE_SERVICE_ACCOUNT_JSON_B64']
  end

  # APPEND-ONLY: This method ONLY adds new rows, never reads or modifies existing data
  def add_booking_to_sheet(booking_data)
    return { success: false, error: "Google Sheets ID not configured" } unless @spreadsheet_id
    return { success: false, error: "Google Service Account B64 not configured" } unless @service_account_b64

    begin
      # Decode Base64 and create StringIO object
      service_account_json = Base64.decode64(@service_account_b64)
      json_io = StringIO.new(service_account_json)

      # Create session using SERVICE ACCOUNT from Base64-decoded JSON
      session = GoogleDrive::Session.from_service_account_key(json_io)

      # Get the spreadsheet - READ ONLY to find append position
      spreadsheet = session.spreadsheet_by_key(@spreadsheet_id)
      ws = spreadsheet.worksheets[0]

      # Extract primary social username
      social_username = extract_primary_social_username(booking_data[:social_accounts])

      # Prepare row data (matching your CRM columns)
      row_data = [
        booking_data[:selected_date],           # Date (A)
        booking_data[:selected_time],           # Time (B)
        booking_data[:name],                    # Name Surname (C)
        booking_data[:phone_number],            # Phone (D)
        social_username,                        # Instagram username (E)
        booking_data[:status] || '',            # Status (F) - empty by default
        booking_data[:special_note] || ''       # Special Note (G) - empty by default
      ]

      # SECURITY: Only get row count, never read existing data
      current_rows = ws.num_rows

      # APPEND-ONLY: Insert new row at the end (no modification of existing rows)
      ws.insert_rows(current_rows + 1, [row_data])
      ws.save

      puts "APPEND-ONLY: Successfully added booking to Google Sheets row #{current_rows + 1}: #{booking_data[:name]}"
      { success: true, row_added: current_rows + 1 }

    rescue => e
      puts "Google Sheets APPEND error: #{e.message}"
      { success: false, error: e.message }
    end
  end

  # SECURITY: Explicitly NO read methods - removed to prevent data access

  private

  def extract_primary_social_username(social_accounts)
    return '' if social_accounts.nil? || social_accounts.empty?

    # Priority: Instagram first, then others with platform name
    if social_accounts['instagram'] && !social_accounts['instagram'].empty?
      return "@#{social_accounts['instagram']}"
    end

    # For other platforms, add platform name in parentheses
    social_accounts.each do |platform, username|
      next if username.nil? || username.empty?
      return "@#{username} (#{platform.capitalize})"
    end

    ''
  end
end