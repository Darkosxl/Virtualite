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
    puts "🔍 Google Sheets - Starting add_booking_to_sheet for #{booking_data[:name]}"

    unless @spreadsheet_id
      puts "❌ Google Sheets ID not configured"
      return { success: false, error: "Google Sheets ID not configured" }
    end

    unless @service_account_b64
      puts "❌ Google Service Account B64 not configured"
      return { success: false, error: "Google Service Account B64 not configured" }
    end

    puts "✅ Credentials found - Spreadsheet ID: #{@spreadsheet_id[0..10]}..."

    begin
      # Decode Base64 and create StringIO object
      puts "🔓 Decoding service account credentials..."
      service_account_json = Base64.decode64(@service_account_b64)
      json_io = StringIO.new(service_account_json)

      # Create session using SERVICE ACCOUNT from Base64-decoded JSON
      puts "🔑 Authenticating with Google Sheets..."
      session = GoogleDrive::Session.from_service_account_key(json_io)

      # Get the spreadsheet - READ ONLY to find append position
      puts "📄 Opening spreadsheet..."
      spreadsheet = session.spreadsheet_by_key(@spreadsheet_id)
      ws = spreadsheet.worksheets[0]
      puts "✅ Successfully connected to worksheet: #{ws.title}"

      # Extract primary social username
      social_username = extract_primary_social_username(booking_data[:social_usernames])

      # Prepare row data (matching your CRM columns)
      row_data = [
        booking_data[:selected_date] || 'N/A',  # Date (A) - N/A if not provided
        booking_data[:selected_time] || 'N/A',  # Time (B) - N/A if not provided
        booking_data[:name],                    # Name Surname (C)
        booking_data[:phone_number],            # Phone (D)
        social_username,                        # Instagram username (E)
        booking_data[:email],                   # Email (F)
        booking_data[:occupation] || '',        # Occupation (G)
        booking_data[:status] || '',            # Status (H) - empty by default
        booking_data[:special_note] || ''       # Special Note (I) - empty by default
      ]

      # Find first row where columns A-E are all empty
      target_row = nil
      total_rows = ws.num_rows
      puts "📊 Total rows in sheet: #{total_rows}"

      # Start from row 44 onwards
      (44..[total_rows + 10, 100].max).each do |row_num|
        # Check if columns A, B, C, D, E are all empty
        col_a = ws[row_num, 1]  # Column A (Date)
        col_b = ws[row_num, 2]  # Column B (Time)
        col_c = ws[row_num, 3]  # Column C (Name)
        col_d = ws[row_num, 4]  # Column D (Phone)
        col_e = ws[row_num, 5]  # Column E (Social username)

        # Check if all are empty or nil
        if cell_empty?(col_a) && cell_empty?(col_b) && cell_empty?(col_c) &&
           cell_empty?(col_d) && cell_empty?(col_e)
          target_row = row_num
          puts "✅ Found empty row at: #{target_row}"
          break
        end
      end

      # If no empty row found, append at the end
      if target_row.nil?
        target_row = total_rows + 1
        puts "No empty row found, appending at row #{target_row}"
      else
        puts "Found empty row at #{target_row}, inserting there"
      end

      # Write data to the target row
      puts "✍️  Writing data to row #{target_row}..."
      row_data.each_with_index do |value, index|
        ws[target_row, index + 1] = value
      end

      puts "💾 Saving spreadsheet..."
      ws.save
      puts "✅ Save successful!"

      puts "🎉 Successfully added booking to Google Sheets row #{target_row}: #{booking_data[:name]}"
      { success: true, row_added: target_row }

    rescue => e
      puts "❌ Google Sheets ERROR: #{e.class} - #{e.message}"
      puts "📋 Error backtrace: #{e.backtrace.first(3).join("\n")}"
      { success: false, error: "#{e.class}: #{e.message}" }
    end
  end

  # SECURITY: Explicitly NO read methods - removed to prevent data access

  private

  def cell_empty?(cell)
    cell.nil? || cell.to_s.strip.empty?
  end

  def extract_primary_social_username(social_accounts)
    return '' if social_accounts.nil? || social_accounts.empty?

    # Priority: Instagram first, then others with platform name
    if social_accounts['instagram'] && !social_accounts['instagram'].empty?
      return "@#{social_accounts['instagram']}"
    end

    # For other platforms, add platform name in parentheses
    social_accounts.each do |platform, username|
      next if username.nil? || username.empty?
      platform_name = case platform.downcase
                      when 'tiktok'
                        'Tik Tok'
                      when 'youtube'
                        'YouTube'
                      else
                        platform.capitalize
                      end
      return "@#{username} (#{platform_name})"
    end

    ''
  end
end