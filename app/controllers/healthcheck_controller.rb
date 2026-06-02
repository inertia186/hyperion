class HealthcheckController < ApplicationController
  skip_before_action :sign_in

  def show
    database_ok = database_healthy?
    status = database_ok ? :ok : :service_unavailable

    render json: {
      status: database_ok ? 'ok' : 'unavailable',
      timestamp: Time.current.iso8601,
      checks: {
        database: database_ok ? 'ok' : 'unavailable'
      }
    }, status: status
  end

private
  def database_healthy?
    ActiveRecord::Base.connection.select_value('SELECT 1').to_i == 1
  rescue
    false
  end
end
