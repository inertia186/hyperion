require 'digest'

class OpsDiagnostics
  SAMPLE_LIMIT = 5

  class << self
    def inbox(account_name)
      account = Account.find_by!(name: account_name)
      query = PostCurationQuery.new(account: account, params: {}, session: {}, track_past_tags: false).call
      breakdown = inbox_filter_breakdown(account)

      {
        account: account.name,
        settings: {
          minimum_reputation: account.minimum_reputation,
          hivewatchers_blacklist_enabled: account.hivewatchers_blacklist_enabled?,
          blacklist_sources: account.blacklist_sources,
          ignored_tags_count: account.ignored_tags.count,
          poisoned_pill_tags_count: account.poisoned_pill_tags.count
        },
        mode_counts: query.mode_counts,
        total_count: query.total_count,
        filters: breakdown.except(:relation),
        sample: sample_posts(breakdown.fetch(:relation))
      }
    end

    def reputation(account_name)
      account = Account.find_by!(name: account_name)
      active = Post.active

      {
        account: account.name,
        minimum_reputation: account.minimum_reputation,
        author_reputations: {
          total: AuthorReputation.count,
          default: AuthorReputation.where(reputation: HiveReputation::DEFAULT_REPUTATION).count,
          nondefault: AuthorReputation.where.not(reputation: HiveReputation::DEFAULT_REPUTATION).count,
          min: AuthorReputation.minimum(:reputation),
          max: AuthorReputation.maximum(:reputation)
        },
        active_posts: {
          default_authors: active.where(author_reputation: HiveReputation::DEFAULT_REPUTATION).distinct.count(:author),
          below_minimum: active.where('author_reputation < ?', account.minimum_reputation).count,
          at_or_above_minimum: active.where('author_reputation >= ?', account.minimum_reputation).count
        },
        sample_scores: active.
          where(author_reputation: HiveReputation::DEFAULT_REPUTATION).
          distinct.
          limit(SAMPLE_LIMIT).
          pluck(:author).
          map { |author| {author: author, reputation: HiveReputation.scores_for([author]).fetch(author.downcase)} }
      }
    end

    def blacklist
      blacklisted = Post.blacklisted
      db_ordered_keys = blacklisted.order(:author, :permlink).pluck(:author, :permlink).map { |author, permlink| post_key(author, permlink) }
      normalized_keys = db_ordered_keys.sort
      reason_map = blacklist_reason_map(blacklisted)

      {
        environment: Rails.env,
        counts: {
          posts: Post.count,
          blacklisted: blacklisted.count,
          active_blacklisted: Post.active.blacklisted.count,
          blacklisted_with_reasons: blacklisted.where.not(blacklist_reasons: []).count
        },
        signatures: {
          normalized_blacklisted_keys: digest_lines(normalized_keys),
          database_order_blacklisted_keys: digest_lines(db_ordered_keys),
          normalized_blacklist_reasons: digest_json(reason_map)
        },
        samples: {
          first: normalized_keys.first(SAMPLE_LIMIT),
          last: normalized_keys.last(SAMPLE_LIMIT)
        },
        indexer_states: IndexerState.order(:name).map { |state| indexer_state_payload(state) }
      }
    end

  private
    def blacklist_reason_map(relation)
      relation.pluck(:author, :permlink, :blacklist_reasons).each_with_object({}) do |(author, permlink, reasons), map|
        map[post_key(author, permlink)] = reasons
      end.sort.to_h
    end

    def digest_json(value)
      Digest::SHA256.hexdigest(JSON.generate(value))
    end

    def digest_lines(lines)
      Digest::SHA256.hexdigest(lines.join("\n"))
    end

    def inbox_filter_breakdown(account)
      recent = Post.active
      no_blacklist = without_blacklist_sources(recent, account.blacklist_sources)
      reputation = no_blacklist.where('posts.author_reputation >= ?', account.minimum_reputation)
      unread = reputation.where.not(id: account.read_posts.select(:post_id))
      no_ignored = unread.where.not(id: Tag.where(tag: account.ignored_tags.select(:tag)).select(:post_id))
      final = no_ignored.where.not(author: account.poisoned_authors)

      {
        recent: recent.count,
        no_blacklist: no_blacklist.count,
        reputation: reputation.count,
        unread: unread.count,
        no_ignored: no_ignored.count,
        final: final.count,
        relation: final
      }
    end

    def without_blacklist_sources(relation, blacklist_sources)
      return relation if blacklist_sources.empty?

      relation.where("NOT #{blacklist_source_sql}", blacklist_sources)
    end

    def blacklist_source_sql
      "EXISTS (SELECT 1 FROM json_array_elements(posts.blacklist_reasons) AS blacklist_reason WHERE blacklist_reason->>'account' IN (?))"
    end

    def sample_posts(relation)
      relation.limit(SAMPLE_LIMIT).pluck(:author, :title, :author_reputation).map do |author, title, reputation|
        {author: author, title: title, author_reputation: reputation}
      end
    end

    def post_key(author, permlink)
      "#{author}/#{permlink}"
    end

    def indexer_state_payload(state)
      state.attributes.slice('name', 'last_id', 'last_indexed_at', 'last_sweep_at')
    end
  end
end
