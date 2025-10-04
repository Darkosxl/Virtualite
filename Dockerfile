FROM ruby:3.2-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Gemfile first for better caching
COPY Gemfile* ./
RUN bundle install --jobs 4 --retry 3

# Copy app code
COPY . .

# Create non-root user
RUN useradd -m -u 1001 appuser && \
    chown -R appuser:appuser /app

USER appuser

# Set production environment
ENV RACK_ENV=production
ENV PORT=4568

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=5 \
  CMD curl -fsS http://localhost:${PORT:-4568}/ || exit 1

EXPOSE 4568

CMD ["bundle", "exec", "rackup", "-o", "0.0.0.0", "-p", "4568", "config.ru"]