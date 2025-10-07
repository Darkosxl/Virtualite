require 'net/http'
require 'uri'
require 'json'
require 'logger'

class GeoIP
  def initialize
    @api_url = 'http://ip-api.com/json/'
    @logger = Logger.new(STDOUT)
    @logger.level = Logger::INFO
    @cache = {} # Simple in-memory cache to avoid hitting rate limits
    @cache_ttl = 3600 # Cache for 1 hour
  end

  def lookup(ip_address)
    return nil unless ip_address && !ip_address.empty?

    # Don't lookup localhost or private IPs
    return nil if ['127.0.0.1', 'localhost', '::1'].include?(ip_address)
    return nil if ip_address.start_with?('192.168.', '10.', '172.16.')

    # Check cache first
    cached = get_from_cache(ip_address)
    return cached if cached

    begin
      # IP-API.com free tier: 45 requests/minute
      # Fields: country, countryCode, region, regionName, city, zip, lat, lon, timezone, isp
      uri = URI("#{@api_url}#{ip_address}?fields=status,message,country,countryCode,region,regionName,city,zip")

      http = Net::HTTP.new(uri.host, uri.port)
      http.read_timeout = 3
      http.open_timeout = 2

      response = http.get(uri.request_uri)

      if response.code.to_i == 200
        data = JSON.parse(response.body)

        if data['status'] == 'success'
          result = {
            country: data['countryCode'], # 2-letter code (e.g., 'TR', 'US')
            city: data['city'],
            state: data['region'], # State code (e.g., 'CA', 'TX')
            state_name: data['regionName'], # Full state name
            zip: data['zip']
          }

          # Cache the result
          add_to_cache(ip_address, result)

          @logger.info("GeoIP lookup success for #{ip_address}: #{result[:city]}, #{result[:state]}, #{result[:country]}")
          return result
        else
          @logger.warn("GeoIP lookup failed for #{ip_address}: #{data['message']}")
          return nil
        end
      else
        @logger.error("GeoIP API error: HTTP #{response.code}")
        return nil
      end

    rescue Net::TimeoutError => e
      @logger.error("GeoIP timeout for #{ip_address}: #{e.message}")
      nil
    rescue JSON::ParserError => e
      @logger.error("GeoIP JSON parse error: #{e.message}")
      nil
    rescue => e
      @logger.error("GeoIP lookup error for #{ip_address}: #{e.message}")
      nil
    end
  end

  private

  def get_from_cache(ip)
    return nil unless @cache[ip]

    entry = @cache[ip]
    # Check if cache entry is still valid
    if Time.now.to_i - entry[:timestamp] < @cache_ttl
      entry[:data]
    else
      @cache.delete(ip)
      nil
    end
  end

  def add_to_cache(ip, data)
    @cache[ip] = {
      data: data,
      timestamp: Time.now.to_i
    }

    # Simple cache cleanup: remove old entries if cache gets too large
    if @cache.size > 1000
      # Remove oldest 100 entries
      @cache = @cache.sort_by { |_, v| v[:timestamp] }.last(900).to_h
    end
  end
end
