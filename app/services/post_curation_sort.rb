class PostCurationSort
  SORTS = %w(latest oldest interesting most_tags least_tags most_prolific least_prolific highest_payout lowest_payout).freeze
  DEFAULT_SORT = 'latest'

  def self.apply(scope, sort:, tag:)
    new(scope, sort: sort, tag: tag).apply
  end

  def initialize(scope, sort:, tag:)
    @scope = scope
    @sort = SORTS.include?(sort) ? sort : DEFAULT_SORT
    @tag = tag
  end

  def apply
    case sort
    when 'latest' then scope.order(created_at: :desc)
    when 'oldest' then scope.order(created_at: :asc)
    when 'interesting' then scope.order(Arel.sql('payout_amount DESC NULLS LAST, author_reputation DESC, posts.created_at DESC'))
    when 'most_tags' then scope.order_by_tag_count(:desc)
    when 'least_tags' then scope.order_by_tag_count(:asc)
    when 'most_prolific' then scope.order_by_prolific(tag, :DESC)
    when 'least_prolific' then scope.order_by_prolific(tag, :ASC)
    when 'highest_payout' then scope.order_by_payout(:desc)
    when 'lowest_payout' then scope.order_by_payout(:asc)
    else scope
    end
  end

private
  attr_reader :scope, :sort, :tag
end

