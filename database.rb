require 'pg'
require 'json'

class Database
  def initialize
    @connection = PG.connect(ENV['POSTGRES_URL'])
    setup_table
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
        booking_confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    SQL
  rescue PG::Error => e
    puts "Database setup error: #{e.message}"
  end

  public

  def save_booking(booking_data)
    social_accounts = booking_data[:social_usernames] || {}
    
    @connection.exec_params(
      'INSERT INTO bookings (name, phone_number, selected_date, selected_time, social_accounts) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [
        booking_data[:name],
        booking_data[:phone_number], 
        booking_data[:selected_date],
        booking_data[:selected_time],
        social_accounts.to_json
      ]
    )
  rescue PG::Error => e
    puts "Database save error: #{e.message}"
    nil
  end

  def get_all_bookings
    result = @connection.exec('SELECT * FROM bookings ORDER BY created_at DESC')
    result.map { |row| format_booking(row) }
  rescue PG::Error => e
    puts "Database fetch error: #{e.message}"
    []
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
      booking_confirmed_at: row['booking_confirmed_at'],
      created_at: row['created_at']
    }
  end
end
