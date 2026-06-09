class HivesignerAuthenticator
  ME_URL = 'https://hivesigner.com/api/me'

  attr_reader :access_token

  def initialize(access_token)
    @access_token = access_token
  end

  def account
    return nil if access_token.blank?

    response = fetch_me
    payload = JSON[response.body]
    account_name = payload['user']

    return nil unless response.code == '200' && account_name.present?

    Account.find_or_create_by(name: account_name)
  rescue JSON::ParserError
    nil
  end

  def self.cert_store
    store = OpenSSL::X509::Store.new
    store.set_default_paths
    store.flags = 0 if store.respond_to?(:flags=)
    store
  end

private
  def fetch_me
    uri = URI.parse(ME_URL)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == 'https'
    http.cert_store = self.class.cert_store
    request = Net::HTTP::Get.new(uri.request_uri)
    request['Authorization'] = access_token
    http.request(request)
  end
end
