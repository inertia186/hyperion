require 'test_helper'

class CommunityTest < ActiveSupport::TestCase
  test 'profile image url reads community account json metadata' do
    community = communities(:haf_community)

    assert_equal 'https://example.com/haf-community.png', community.profile_image_url
  end

  test 'profile image url reads string posting json metadata' do
    community = Community.new(
      name: 'hive-11111',
      title: 'Posting Image',
      community_account: {
        'json_metadata' => {},
        'posting_json_metadata' => '{"profile":{"profile_image":"https://example.com/posting.png"}}'
      }
    )

    assert_equal 'https://example.com/posting.png', community.profile_image_url
  end

  test 'profile image url reads top level profile forms' do
    community = Community.new(
      name: 'hive-11112',
      title: 'Top Level Profile',
      community_account: {'profile' => {'profile_image' => 'https://example.com/profile.png'}}
    )

    assert_equal 'https://example.com/profile.png', community.profile_image_url
  end

  test 'profile image url is blank without profile image metadata' do
    community = Community.new(name: 'hive-11111', title: 'No Image', community_account: {})

    assert_nil community.profile_image_url
  end

  test 'ensure present skips communities that already exist' do
    assert_no_changes -> { Community.count } do
      Community.ensure_present!(%w(hive-163399 hive-136001 hive-163399))
    end
  end

  test 'ensure present creates missing communities from bridge metadata' do
    community_payload = FakeCommunityPayload.new.merge!(
      'name' => 'hive-11113',
      'title' => 'Seeded Community',
      'created_at' => 2.days.ago.utc.strftime('%Y-%m-%dT%H:%M:%S'),
      'is_nsfw' => false,
      'lang' => 'en',
      'num_authors' => 0,
      'num_pending' => 0,
      'subscribers' => 0,
      'sum_pending' => 0,
      'settings' => {},
      'team' => [],
      'type_id' => 1
    )
    bridge = Struct.new(:payload) do
      Result = Struct.new(:result)

      def get_community(name:)
        payload['name'] = name
        Result.new(payload)
      end
    end.new(community_payload)

    Hive::Bridge.stub(:new, bridge) do
      Community.stub(:database_api, EmptyAccountApi.new) do
        Community.ensure_present!(%w(hive-11113))
      end
    end

    assert_equal 'Seeded Community', Community.find_by!(name: 'hive-11113').title
  end

private
  class EmptyAccountApi
    Result = Struct.new(:accounts)

    def find_accounts(accounts:)
      yield Result.new([])
    end
  end

  class FakeCommunityPayload < Hash
    def created_at
      self['created_at']
    end

    def settings
      self['settings']
    end

    def team
      self['team']
    end

    def contest
      self['contest']
    end
  end
end
