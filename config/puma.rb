workers ENV.fetch("WEB_CONCURRENCY") { 2 }
threads_count = ENV.fetch("RAILS_MAX_THREADS") { 5 }
threads threads_count, threads_count

port ENV.fetch("PORT") { 4568 }
environment ENV.fetch("RACK_ENV") { "production" }

preload_app!

# CRITICAL: Reconnect to PostgreSQL after each worker forks
# This prevents SSL connection corruption that causes:
# "PQconsumeInput() SSL error: decryption failed or bad record mac"
on_worker_boot do
  puts "Worker booted, reconnecting to database..."

  # Close any inherited PostgreSQL connections to prevent SSL corruption
  ObjectSpace.each_object(PG::Connection) do |conn|
    begin
      conn.close if conn && !conn.finished?
    rescue => e
      puts "Error closing inherited PG connection: #{e.message}"
    end
  end

  # Force garbage collection to clean up closed connections
  GC.start

  puts "Database reconnection completed for worker #{Process.pid}"
end

# Alternative callback name for Puma 6+ compatibility
on_worker_fork do
  puts "Worker forked, reconnecting to database..."

  # Close any inherited PostgreSQL connections to prevent SSL corruption
  ObjectSpace.each_object(PG::Connection) do |conn|
    begin
      conn.close if conn && !conn.finished?
    rescue => e
      puts "Error closing inherited PG connection: #{e.message}"
    end
  end

  # Force garbage collection to clean up closed connections
  GC.start

  puts "Database reconnection completed for forked worker #{Process.pid}"
end