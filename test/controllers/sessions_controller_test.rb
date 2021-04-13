require 'test_helper'

class SessionsControllerTest < ActionDispatch::IntegrationTest
  def test_routings
    assert_routing 'sessions/account/authorized', controller: 'sessions', action: 'authorized', id: 'account'
    assert_routing 'sessions/authorized', controller: 'sessions', action: 'authorized'
    assert_routing 'sessions/new', controller: 'sessions', action: 'new'
    assert_routing({ method: 'post', path: '/sessions' }, controller: 'sessions', action: 'create')
    assert_routing({ method: 'delete', path: '/sessions/account' }, controller: 'sessions', action: 'destroy', id: 'account')
  end
end
