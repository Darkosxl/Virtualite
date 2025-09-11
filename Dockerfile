FROM ruby:3.2-slim

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

# Copy Gemfile and install gems
COPY Gemfile* ./
RUN bundle install

# Copy application files
COPY . .

# Expose port
EXPOSE 4567

# Start the server
CMD ["ruby", "app.rb"]