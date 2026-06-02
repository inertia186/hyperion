require 'test_helper'

class HealthcheckControllerTest < ActionController::TestCase
  tests HealthcheckController

  test 'routes well-known healthcheck path' do
    assert_routing(
      {method: :get, path: '/.well-known/healthcheck.json'},
      {controller: 'healthcheck', action: 'show', format: :json}
    )
  end

  test 'returns minimal healthy payload without authentication' do
    get :show, format: :json

    assert_response :success
    assert_equal 'application/json', response.media_type
    payload = JSON.parse(response.body)
    assert_equal 'ok', payload.fetch('status')
    assert_equal 'ok', payload.dig('checks', 'database')
    assert payload.fetch('timestamp').present?
    assert_equal %w(checks status timestamp), payload.keys.sort
  end

  test 'returns unavailable when database check fails' do
    connection = FailingConnection.new

    ActiveRecord::Base.stub(:connection, connection) do
      get :show, format: :json
    end

    assert_response :service_unavailable
    payload = JSON.parse(response.body)
    assert_equal 'unavailable', payload.fetch('status')
    assert_equal 'unavailable', payload.dig('checks', 'database')
  end

private
  class FailingConnection
    def select_value(_sql)
      raise ActiveRecord::ConnectionNotEstablished
    end
  end
end
