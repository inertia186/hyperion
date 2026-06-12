class PostPayout
  def self.parse(payout_value)
    match = payout_value.to_s.strip.match(/\A(?<amount>-?\d+(?:\.\d+)?)\s+(?<currency>[A-Z]{2,10})\z/)
    return [nil, nil] unless match

    [BigDecimal(match[:amount]), match[:currency]]
  end

  def initialize(post)
    @post = post
  end

  def capture!(payout_value, fetched_at: Time.current, source: 'exact')
    amount, currency = self.class.parse(payout_value)

    post.update!(
      payout: payout_value.presence,
      payout_amount: amount,
      payout_currency: currency,
      payout_fetched_at: fetched_at,
      payout_unavailable_at: nil,
      payout_source: source
    )
  end

  def mark_unavailable!(unavailable_at: Time.current)
    post.update!(payout_unavailable_at: unavailable_at, payout_source: nil)
  end

  private

  attr_reader :post
end
