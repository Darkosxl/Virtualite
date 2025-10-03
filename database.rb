require 'pg'
require 'json'
require 'dotenv/load'


class Database
  def initialize
    connect
    setup_table
  end

  def connect
    @connection = PG.connect(ENV['POSTGRES_URL'])
  end

  def reconnect
    begin
      @connection.close if @connection && !@connection.finished?
    rescue => e
      puts "Error closing existing connection: #{e.message}"
    end
    connect
    puts "Database reconnected successfully"
  end

  def ensure_connection
    # Only reconnect if connection is actually dead, don't test every time
    start_time = Time.now
    begin
      if @connection && !@connection.finished?
        duration = ((Time.now - start_time) * 1000).round(2)
        puts "      🔌 [DB] Connection check: ALIVE (#{duration}ms)"
        return
      end
      puts "      ⚠️ [DB] Connection lost, reconnecting..."
      reconnect
    rescue => e
      puts "      ❌ [DB] Connection check failed: #{e.message}, reconnecting..."
      reconnect
    end
  end

  private

  def setup_table
    @connection.exec <<~SQL
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone_number VARCHAR(50) NOT NULL,
        selected_date DATE NOT NULL,
        selected_time TIME NOT NULL,
        social_accounts JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT '',
        special_note TEXT DEFAULT '',
        booking_confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    SQL

    # Add columns if they don't exist (for existing databases)
    begin
      @connection.exec("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT ''")
      @connection.exec("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS special_note TEXT DEFAULT ''")
    rescue PG::Error => e
      puts "Column addition warning: #{e.message}"
    end
  rescue PG::Error => e
    puts "Database setup error: #{e.message}"
  end

  public

  def save_booking(booking_data)
    ensure_connection
    social_accounts = booking_data[:social_usernames] || {}

    result = @connection.exec_params(
      'INSERT INTO bookings (name, phone_number, selected_date, selected_time, social_accounts) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [
        booking_data[:name],
        booking_data[:phone_number],
        booking_data[:selected_date],
        booking_data[:selected_time],
        social_accounts.to_json
      ]
    )
    result[0]['id'].to_i
  rescue PG::Error => e
    puts "Database save error: #{e.message}"
    nil
  end

  def get_all_bookings
    ensure_connection
    result = @connection.exec('SELECT * FROM bookings ORDER BY created_at DESC')
    result.map { |row| format_booking(row) }
  rescue PG::Error => e
    puts "Database fetch error: #{e.message}"
    []
  end

  def get_bookings_for_date(date)
    ensure_connection
    result = @connection.exec_params(
      'SELECT * FROM bookings WHERE selected_date = $1',
      [date]
    )
    result.map { |row| format_booking(row) }
  rescue PG::Error => e
    puts "Database fetch error for date #{date}: #{e.message}"
    []
  end

  def get_masked_name_for_time_slot(date, time)
    ensure_connection
    result = @connection.exec_params(
      'SELECT name FROM bookings WHERE selected_date = $1 AND selected_time = $2 LIMIT 1',
      [date, time]
    )

    if result.ntuples > 0
      name = result[0]['name']
      # Mask the name (e.g., "Cem Arslan" becomes "*** ******")
      name.split.map { |word| '*' * word.length }.join(' ')
    else
      nil
    end
  rescue PG::Error => e
    puts "Database fetch error for masked name: #{e.message}"
    nil
  end

  private

  def format_booking(row)
    {
      id: row['id'].to_i,
      name: row['name'],
      phone_number: row['phone_number'],
      selected_date: row['selected_date'],
      selected_time: row['selected_time'],
      social_accounts: JSON.parse(row['social_accounts'] || '{}'),
      status: row['status'] || '',
      special_note: row['special_note'] || '',
      booking_confirmed_at: row['booking_confirmed_at'],
      created_at: row['created_at']
    }
  end
end
