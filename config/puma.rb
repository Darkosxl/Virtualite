# Use single-process mode (no workers) to avoid fork issues with connection pool
workers 0
threads_count = ENV.fetch("RAILS_MAX_THREADS") { 4 }
threads threads_count, threads_count

port ENV.fetch("PORT") { 4568 }
environment ENV.fetch("RACK_ENV") { "production" }