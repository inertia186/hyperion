class HiveReputation
  DEFAULT_REPUTATION = 25
  REPUTATION_BATCH_SIZE = 1000
  REPUTATION_REFRESH_WINDOWS = [
    [24, 12.hours],
    [39, 1.day],
    [54, 3.days],
    [69, 1.week],
    [Float::INFINITY, 1.month]
  ].freeze

  class << self
    def score(raw_reputation)
      return DEFAULT_REPUTATION if raw_reputation.blank?

      reputation = raw_reputation.to_s
      negative = reputation.start_with?('-')
      reputation = reputation[1..] if negative

      output = log10(reputation)
      output = 0 unless output.finite?
      output = [output - 9, 0].max
      output = -output if negative
      (output * 9 + DEFAULT_REPUTATION).to_i
    end

    def scores_for(authors, api: Account.api, database_api: nil, fallback_on_error: true)
      authors = Array(authors).map(&:to_s).map(&:downcase).reject(&:blank?).uniq
      return {} if authors.empty?

      scores = authors.index_with { DEFAULT_REPUTATION }
      fetch_scores(authors, scores, api)

      scores
    rescue => e
      raise e unless fallback_on_error

      Rails.logger.warn "Unable to refresh author reputation scores: #{e.class}: #{e.message}"
      authors.index_with { DEFAULT_REPUTATION }
    end

    def scores_for_indexing(authors, api: Account.api)
      authors = Array(authors).map(&:to_s).map(&:downcase).reject(&:blank?).uniq
      return {} if authors.empty?

      cached_scores = fresh_cached_scores_for(authors)
      refresh_authors = authors - cached_scores.keys
      refreshed_scores = refresh_authors.empty? ? {} : scores_for(refresh_authors, api: api, fallback_on_error: false)
      cache_scores(refreshed_scores)

      cached_scores.merge(refreshed_scores)
    rescue => e
      Rails.logger.warn "Unable to refresh author reputation scores: #{e.class}: #{e.message}"
      cached_scores ||= {}
      refresh_authors ||= authors - cached_scores.keys
      cached_scores.merge(refresh_authors.index_with { DEFAULT_REPUTATION })
    end

    def refresh_window_for(reputation)
      score = Integer(reputation)
      REPUTATION_REFRESH_WINDOWS.find { |threshold, _window| score <= threshold }.last
    rescue
      12.hours
    end

  private
    def fresh_cached_scores_for(authors)
      cached_reputations = AuthorReputation.where(account: authors).index_by(&:account)

      missing_authors = authors - cached_reputations.keys
      seed_scores = stored_post_reputation_scores_for(missing_authors)
      cache_scores(seed_scores)
      cached_reputations.merge!(AuthorReputation.where(account: seed_scores.keys).index_by(&:account)) if seed_scores.any?

      cached_reputations.each_with_object({}) do |(author, author_reputation), scores|
        next if author_reputation.refreshed_at < refresh_window_for(author_reputation.reputation).ago

        scores[author] = author_reputation.reputation
      end
    end

    def stored_post_reputation_scores_for(authors)
      return {} if authors.empty?

      Post
        .where('LOWER(author) IN (?)', authors)
        .where.not(author_reputation: DEFAULT_REPUTATION)
        .group(Arel.sql('LOWER(author)'))
        .maximum(:author_reputation)
    end

    def cache_scores(scores)
      return if scores.empty?

      timestamp = Time.current
      scores.each do |account, reputation|
        author_reputation = AuthorReputation.find_or_initialize_by(account: account)
        author_reputation.reputation = reputation
        author_reputation.refreshed_at = timestamp
        author_reputation.save!
      end
    end

    def fetch_scores(authors, scores, api)
      authors.each_slice(REPUTATION_BATCH_SIZE) do |batch|
        accounts = fetch_accounts(api, batch)
        accounts_by_name = accounts.index_by { |account| account_name(account) }
        accounts_by_name.each do |name, account|
          scores[name] = score_profile_reputation(account_field(account, :reputation)) if scores.key?(name)
        end
      end
    end

    def fetch_accounts(api, authors)
      response = api.rpc_client.rpc_execute(:bridge, :get_profiles, {accounts: authors})
      raise Hive::UnknownError, response.error.inspect if response.respond_to?(:error) && response.error.present?

      Array(response.result)
    end

    def account_name(account)
      (account_field(account, :name) || account_field(account, :account)).to_s.downcase
    end

    def score_profile_reputation(reputation)
      return DEFAULT_REPUTATION if reputation.blank?

      reputation.to_f.to_i
    end

    def log10(reputation)
      leading_digits = reputation[0, 4].to_i
      return 0 if leading_digits <= 0

      log = Math.log(leading_digits) / Math.log(10) + 0.00000001
      n = reputation.length - 1
      n + (log - log.to_i)
    end

    def account_field(account, field)
      if account.respond_to?(field)
        account.public_send(field)
      elsif account.respond_to?(:[])
        account[field.to_s] || account[field]
      end
    end
  end
end
