class PostKeywordSearch
  def initialize(query)
    @query = query
  end

  def terms
    @terms ||= query.to_s.split(/\s+/).map { |term| term.sub(/\A@+/, '') }.reject(&:blank?)
  end

  def apply(relation)
    terms.reduce(relation) do |scope, term|
      pattern = "%#{ActiveRecord::Base.sanitize_sql_like(term)}%"
      scope.where('(posts.title ILIKE ? OR posts.body ILIKE ?)', pattern, pattern)
    end
  end

  def suggestion
    target = terms.find { |term| term.length >= 3 } || terms.first
    return nil if target.blank?

    candidate_counts.keys.
      reject { |candidate| candidate == target.downcase }.
      map { |candidate| [candidate, levenshtein_distance(target.downcase, candidate)] }.
      select { |_candidate, distance| distance <= suggestion_distance_limit(target) }.
      sort_by { |candidate, distance| [distance, -candidate_counts.fetch(candidate), candidate] }.
      map(&:first).
      find do |candidate|
        suggestion = terms.map { |term| term == target ? candidate : term }.join(' ')
        return suggestion if self.class.new(suggestion).apply(Post.all).exists?
      end
  end

private
  attr_reader :query

  def candidate_counts
    @candidate_counts ||= Post.where.not(title: [nil, '']).order(created_at: :desc).limit(2000).pluck(:title).
      flat_map { |title| title.to_s.downcase.scan(/[a-z0-9][a-z0-9-]{2,}/) }.
      tally
  end

  def suggestion_distance_limit(term)
    term.length <= 4 ? 1 : 2
  end

  def levenshtein_distance(left, right)
    previous = (0..right.length).to_a

    left.chars.each_with_index do |left_char, left_index|
      current = [left_index + 1]

      right.chars.each_with_index do |right_char, right_index|
        current << [
          current[right_index] + 1,
          previous[right_index + 1] + 1,
          previous[right_index] + (left_char == right_char ? 0 : 1)
        ].min
      end

      previous = current
    end

    previous.last
  end
end
