require 'test_helper'

class Api::V1::AgentControllerTest < ActionController::TestCase
  tests Api::V1::AgentController

  setup do
    account = accounts(:curated)
    def account.blacklist_sources
      ['fixture-curator']
    end
    @request.session[:current_account] = account
    posts(:blacklisted_allowed).update!(blacklist_reasons: [{'account' => 'fixture-curator'}])
  end

  test 'session returns unauthenticated guidance without login' do
    @request.session[:current_account] = nil

    get :show_session

    assert_response :success
    assert_equal false, response_json.fetch('authenticated')
    assert_equal new_session_path, response_json.fetch('login_url')
    assert_equal api_v1_agent_auth_challenges_path, response_json.fetch('auth_challenge_url')
  end

  test 'session returns account and curation state' do
    get :show_session

    assert_response :success
    assert_equal true, response_json.fetch('authenticated')
    assert_equal 'fixture-curator', response_json.dig('account', 'name')
    assert_includes response_json.fetch('ignored_tags'), 'spam'
    assert_equal voting_power_api_v1_session_path, response_json.fetch('voting_power_url')
  end

  test 'digest returns interesting unread posts with agent fields and vote links' do
    posts(:allowed_unread).update!(
      body: 'Useful post body about curation and HAF indexing.',
      payout: '2.000 HBD',
      payout_amount: 2,
      payout_currency: 'HBD',
      author_reputation: 70
    )
    posts(:muted_unread).update!(
      body: 'Muted but still visible while mute filtering is disabled.',
      payout: '9.000 HBD',
      payout_amount: 9,
      payout_currency: 'HBD',
      author_reputation: 25
    )

    get :digest, params: {limit: 10}

    assert_response :success
    titles = response_json.fetch('posts').map { |post| post.fetch('title') }
    assert_equal ['Muted Unread', 'Allowed Unread'], titles
    assert_not_includes titles, 'Read Allowed'
    assert_not_includes titles, 'Ignored Unread'
    assert_not_includes titles, 'Blacklisted Allowed'

    post = response_json.fetch('posts').find { |candidate| candidate.fetch('title') == 'Allowed Unread' }
    assert_equal 'visible-author', post.fetch('author')
    assert_includes post.fetch('excerpt'), 'Useful post body'
    assert_equal false, post.fetch('read')
    assert_nil post.fetch('current_vote')
    assert_includes post.fetch('interest_reasons'), 'unread'
    assert_includes post.fetch('interest_reasons'), 'known_payout'
    assert_equal 'https://hivesigner.com/sign/vote?authority=post&voter=fixture-curator&author=visible-author&permlink=allowed-unread&weight=10000', post.dig('vote_links', 'upvote')
    assert_equal 'https://hivesigner.com/sign/vote?authority=post&voter=fixture-curator&author=visible-author&permlink=allowed-unread&weight=-10000', post.dig('vote_links', 'downvote')
  end

  test 'vote link validates weight and encodes signer parameters' do
    post = posts(:allowed_unread)
    post.update!(author: 'visible.author')

    get :vote_link, params: {id: post.id, weight: 12_345}

    assert_response :success
    assert_equal 10_000, response_json.fetch('weight')
    assert_equal 'https://hivesigner.com/sign/vote?authority=post&voter=fixture-curator&author=visible.author&permlink=allowed-unread&weight=10000', response_json.fetch('hivesigner_url')

    get :vote_link, params: {id: post.id, weight: 'not-a-number'}

    assert_response :success
    assert_equal 10_000, response_json.fetch('weight')
  end

  test 'mark read updates requested posts' do
    post :mark_read, params: {post_ids: [posts(:allowed_unread).id, posts(:muted_unread).id]}

    assert_response :success
    assert accounts(:curated).post_read?(posts(:allowed_unread).id)
    assert accounts(:curated).post_read?(posts(:muted_unread).id)
    assert_equal 2, response_json.fetch('marked_count')
    assert_equal [posts(:allowed_unread).id, posts(:muted_unread).id], response_json.fetch('post_ids')
    assert_equal true, response_json.fetch('read')
  end

  test 'mark read accepts a single post_id parameter from agents' do
    post :mark_read, params: {post_id: posts(:allowed_unread).id}

    assert_response :success
    assert accounts(:curated).post_read?(posts(:allowed_unread).id)
    assert_equal 1, response_json.fetch('marked_count')
    assert_equal [posts(:allowed_unread).id], response_json.fetch('post_ids')
    assert_equal true, response_json.fetch('read')
  end

  test 'mark read accepts nested and aliased post id parameters' do
    post :mark_read, params: {agent: {post_id: posts(:allowed_unread).id}}

    assert_response :success
    assert accounts(:curated).post_read?(posts(:allowed_unread).id)
    assert_equal 1, response_json.fetch('marked_count')
    assert_equal [posts(:allowed_unread).id], response_json.fetch('post_ids')

    post :mark_read, params: {ids: [posts(:muted_unread).id, 'not-a-post']}

    assert_response :success
    assert accounts(:curated).post_read?(posts(:muted_unread).id)
    assert_equal 1, response_json.fetch('marked_count')
    assert_equal [posts(:muted_unread).id], response_json.fetch('post_ids')
  end

  test 'mark read reports warnings for empty or invalid post ids' do
    post :mark_read, params: {post_ids: ['nope', nil, 0]}

    assert_response :success
    assert_equal 0, response_json.fetch('marked_count')
    assert_equal [], response_json.fetch('post_ids')
    assert_includes response_json.fetch('warnings'), 'No usable post ids were provided.'
  end

  test 'mark read can apply to all posts matching a query' do
    post :mark_read, params: {all_matching: true, query: {tag: 'haf', limit: 1, page: 1}}

    assert_response :success
    assert_equal true, response_json.fetch('all_matching')
    assert accounts(:curated).post_read?(posts(:allowed_unread).id)
    assert accounts(:curated).post_read?(posts(:muted_unread).id)
    assert_not accounts(:curated).post_read?(posts(:ignored_unread).id)
  end

  test 'ignore and unignore tag mutations update current account state' do
    post :create_ignored_tags, params: {tags: ['New-Spam', 'new-spam']}

    assert_response :created
    assert_includes response_json.fetch('ignored_tags'), 'new-spam'
    assert_equal ['new-spam'], response_json.fetch('tags')
    assert_equal 1, response_json.fetch('changed_count')

    delete :destroy_ignored_tags, params: {tags: ['new-spam']}

    assert_response :success
    assert_not_includes response_json.fetch('ignored_tags'), 'new-spam'
    assert_equal ['new-spam'], response_json.fetch('tags')
    assert_equal 1, response_json.fetch('changed_count')
  end

  test 'ignore and unignore tags accept aliases comma strings and nested payloads' do
    post :create_ignored_tags, params: {agent: {ignored_tags: 'Alias-Spam, second-tag, alias-spam'}}

    assert_response :created
    assert_includes response_json.fetch('ignored_tags'), 'alias-spam'
    assert_includes response_json.fetch('ignored_tags'), 'second-tag'
    assert_equal ['alias-spam', 'second-tag'], response_json.fetch('tags')
    assert_equal 2, response_json.fetch('changed_count')

    delete :destroy_ignored_tags, params: {ignored_tag: 'alias-spam'}

    assert_response :success
    assert_not_includes response_json.fetch('ignored_tags'), 'alias-spam'
    assert_includes response_json.fetch('ignored_tags'), 'second-tag'
    assert_equal ['alias-spam'], response_json.fetch('tags')
    assert_equal 1, response_json.fetch('changed_count')
  end

  test 'ignore and unignore tags report warnings for empty payloads' do
    post :create_ignored_tags, params: {tag: ''}

    assert_response :created
    assert_equal [], response_json.fetch('tags')
    assert_equal 0, response_json.fetch('changed_count')
    assert_includes response_json.fetch('warnings'), 'No usable tags were provided.'

    delete :destroy_ignored_tags, params: {tags: []}

    assert_response :success
    assert_equal [], response_json.fetch('tags')
    assert_equal 0, response_json.fetch('changed_count')
    assert_includes response_json.fetch('warnings'), 'No usable tags were provided.'
  end

  test 'mutations reject foreign browser origins' do
    @request.headers['Origin'] = 'https://evil.example'

    post :mark_read, params: {post_ids: [posts(:allowed_unread).id]}

    assert_response :forbidden
    assert_equal 'Forbidden origin', response_json.fetch('error')
  end

private
  def response_json
    JSON.parse(response.body)
  end
end
