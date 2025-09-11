FROM ruby:3.2-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy and install gems
COPY Gemfile* ./
RUN bundle install --without development

# Copy application code
COPY . .

# Create necessary directories and set permissions
RUN mkdir -p public assets && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 4567

# Use Puma for production
CMD ["bundle", "exec", "puma", "-C", "config/puma.rb"]