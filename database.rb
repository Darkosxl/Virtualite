require 'pg'
require 'json'
require 'dotenv/load'
require 'connection_pool'

class Database
  attr_reader :pool

  def initialize
    # Create connection pool with size limit
    # Pool size MUST match Puma max_threads (4) for optimal performance
    # Using size: 4 - ensure your Supabase pooler can handle this
    pool_size = ENV.fetch('DB_POOL', '4').to_i
    @pool = ConnectionPool.new(size: pool_size, timeout: 5) do
      PG.connect(ENV['POSTGRES_URL'])
    end

    # Setup table using a connection from the pool
    with_connection { |conn| setup_table(conn) }
    puts "✅ Database connection pool initialized (size: #{pool_size})"

    # Start connection reaper thread to prevent stale connections
    start_connection_reaper
  end

  # Execute block with a connection from the pool
  def with_connection
    @pool.with do |conn|
      # Check if connection is still alive
      conn.exec('SELECT 1') rescue reconnect_connection(conn)
      yield conn
    end
  rescue => e
    puts "❌ Connection pool error: #{e.message}"
    raise
  end

  # Graceful shutdown - close all pool connections
  def shutdown
    puts "🛑 Shutting down database connection pool..."
    @reaper_thread.kill if @reaper_thread
    @pool.shutdown { |conn| conn.close rescue nil }
    puts "✅ Database pool closed"
  end

  private

  def reconnect_connection(conn)
    conn.reset
    puts "🔄 Connection reset"
  end

  def setup_table(conn)
    conn.exec <<~SQL
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone_number VARCHAR(50) NOT NULL,
        selected_date DATE,
        selected_time TIME,
        social_accounts JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT '',
        special_note TEXT DEFAULT '',
        booking_confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    SQL

    # Add columns if they don't exist (for existing databases)
    conn.exec("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT ''")
    conn.exec("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS special_note TEXT DEFAULT ''")

    # Make date/time fields nullable for existing databases
    conn.exec("ALTER TABLE bookings ALTER COLUMN selected_date DROP NOT NULL") rescue nil
    conn.exec("ALTER TABLE bookings ALTER COLUMN selected_time DROP NOT NULL") rescue nil
  rescue PG::Error => e
    puts "Table setup: #{e.message}" unless e.message.include?('already exists')
  end

  # Connection reaper - pings connections periodically to prevent stale/idle timeouts
  def start_connection_reaper
    @reaper_thread = Thread.new do
      loop do
        sleep 300 # Every 5 minutes
        begin
          with_connection { |conn| conn.exec('SELECT 1') }
          puts "🔄 Connection reaper: pool health check OK"
        rescue => e
          puts "⚠️  Connection reaper error: #{e.message}"
        end
      end
    rescue => e
      puts "❌ Reaper thread died: #{e.message}"
    end
  end

  public

  def save_booking(booking_data)
    with_connection do |conn|
      social_accounts = booking_data[:social_usernames] || {}

      result = conn.exec_params(
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
    end
  rescue PG::Error => e
    puts "Database save error: #{e.message}"
    nil
  end

  def get_all_bookings
    with_connection do |conn|
      result = conn.exec('SELECT * FROM bookings ORDER BY created_at DESC')
      result.map { |row| format_booking(row) }
    end
  rescue PG::Error => e
    puts "Database fetch error: #{e.message}"
    []
  end

  def get_bookings_for_date(date)
    with_connection do |conn|
      result = conn.exec_params(
        'SELECT * FROM bookings WHERE selected_date = $1',
        [date]
      )
      result.map { |row| format_booking(row) }
    end
  rescue PG::Error => e
    puts "Database fetch error for date #{date}: #{e.message}"
    []
  end

  def get_masked_name_for_time_slot(date, time)
    with_connection do |conn|
      result = conn.exec_params(
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
    end
  rescue PG::Error => e
    puts "Database fetch error for masked name: #{e.message}"
    nil
  end

  # For warmup endpoint - just check pool is alive
  def ensure_connection
    with_connection { |conn| conn.exec('SELECT 1') }
    true
  rescue => e
    puts "Connection check failed: #{e.message}"
    false
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
