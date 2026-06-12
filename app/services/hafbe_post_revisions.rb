require 'net/http'
require 'uri'

class HafbePostRevisions
  DEFAULT_BASE_URL = 'https://api.hive.blog/hafbe-api/'

  MissingBaseUrl = Class.new(StandardError)
  FetchError = Class.new(StandardError)

  def initialize(base_url: ENV.fetch('HAFBE_BASE_URL', DEFAULT_BASE_URL))
    @base_url = base_url.to_s.strip
  end

  def call(post:, local_body:, render_body:)
    raise MissingBaseUrl, 'HAFBE_BASE_URL is not configured' if @base_url.blank?

    revisions = revisions_for(post)
    local_body = local_body.to_s
    if local_body.present? && !diff_match_patch_body?(local_body) && revisions.none? { |revision| revision[:body].to_s.strip == local_body.strip }
      revisions << {
        body: local_body,
        title: post.title,
        published_at: post.updated_at&.iso8601 || post.created_at&.iso8601,
        block_num: post.block_num,
        trx_id: post.trx_id
      }
    end

    render_revisions(revisions, post: post, render_body: render_body)
  end

  def revisions_for(post)
    raise MissingBaseUrl, 'HAFBE_BASE_URL is not configured' if @base_url.blank?

    operation_revisions(fetch_operations(post.author, post.permlink), post)
  end

  def render_revisions(revisions, post:, render_body:)
    revisions.each_with_index.map do |revision, index|
      {
        index: index,
        label: "Revision #{index + 1}",
        title: revision[:title].presence || post.title,
        published_at: revision[:published_at],
        block_num: revision[:block_num],
        trx_id: revision[:trx_id],
        body: revision[:body].to_s,
        body_html: render_body.call(revision[:body].to_s).to_s
      }
    end
  end

private
  def fetch_operations(author, permlink)
    response = Net::HTTP.get_response(revisions_uri(author, permlink))
    raise FetchError, "HAFBE returned #{response.code}" unless response.code.to_i.between?(200, 299)

    JSON.parse(response.body)
  rescue JSON::ParserError => e
    raise FetchError, "HAFBE returned invalid JSON: #{e.message}"
  rescue FetchError
    raise
  rescue => e
    raise FetchError, "Unable to fetch HAFBE revisions: #{e.message}"
  end

  def revisions_uri(author, permlink)
    base = @base_url.delete_suffix('/')
    URI("#{base}/accounts/#{CGI.escape(author)}/operations/comments/#{CGI.escape(permlink)}")
  end

  def operation_revisions(payload, post)
    collection(payload).each_with_index.filter_map do |operation, sequence|
      revision_from_operation(operation, post, sequence)
    end.sort_by { |revision| [revision[:block_num] || Float::INFINITY, revision[:published_at].to_s, revision[:sequence]] }
      .each_with_object([]) do |revision, unique_revisions|
        next if revision[:body].to_s.blank?
        if diff_match_patch_body?(revision[:body])
          next unless unique_revisions.last

          revision[:body] = apply_patch(unique_revisions.last[:body].to_s, revision[:body].to_s)
          next if revision[:body].blank? || diff_match_patch_body?(revision[:body])
        end
        next if unique_revisions.last && unique_revisions.last[:body].to_s.strip == revision[:body].to_s.strip

        unique_revisions << revision.except(:sequence)
      end
  end

  def collection(payload)
    return payload if payload.is_a?(Array)

    payload = payload['result'] || payload['data'] || payload['operations_result'] || payload['operations'] || payload['comments'] if payload.is_a?(Hash)
    return payload if payload.is_a?(Array)
    return collection(payload) if payload.is_a?(Hash)

    []
  end

  def revision_from_operation(operation, post, sequence)
    value, wrapper = comment_value(operation)
    return nil unless value.is_a?(Hash)
    return nil unless value['author'].to_s == post.author && value['permlink'].to_s == post.permlink

    published_at = wrapper['timestamp'] || wrapper['block_time'] || value['timestamp']

    {
      sequence: sequence,
      body: value['body'],
      title: value['title'],
      json_metadata: parse_metadata(value['json_metadata']),
      json_metadata_present: value.key?('json_metadata'),
      parent_permlink: value['parent_permlink'],
      published_at: published_at,
      published_at_time: parse_time(published_at),
      block_num: wrapper['block_num'] || wrapper['block'] || value['block_num'] || value['block'],
      trx_id: wrapper['trx_id'] || wrapper['transaction_id'] || value['trx_id']
    }
  end

  def parse_metadata(metadata)
    case metadata
    when Hash then metadata
    when String then JSON[metadata] rescue {}
    else
      {}
    end
  end

  def parse_time(value)
    Time.parse("#{value}Z")
  rescue
    nil
  end

  def comment_value(operation)
    return [operation, operation] if operation.is_a?(Hash) && operation['body'].present?

    wrapper = operation.is_a?(Hash) ? operation : {}
    op = wrapper['op'] || wrapper['operation'] || wrapper['operation_body'] || wrapper['value']

    if op.is_a?(Array)
      type, value = op
      return [value, wrapper] if type.to_s.include?('comment')
    elsif op.is_a?(Hash)
      type = op['type'] || op['name'] || op['operation_type']
      value = op['value'] || op
      return [value, wrapper] if type.blank? || type.to_s.include?('comment') || value['body'].present?
    end

    [nil, wrapper]
  end

  def apply_patch(body, patch_body)
    patched_body = body.dup
    offset = 0

    parse_patches(patch_body).each do |patch|
      expected = patch[:lines].select { |line| [' ', '-'].include?(line[:action]) }.map { |line| line[:text] }.join
      replacement = patch[:lines].select { |line| [' ', '+'].include?(line[:action]) }.map { |line| line[:text] }.join
      expected_index = [patch[:old_start] - 1 + offset, 0].max
      match_index, match_length = locate_patch(patched_body, patch, expected, expected_index)
      return nil unless match_index

      patched_body[match_index, match_length] = replacement
      offset += replacement.length - match_length
    end

    patched_body
  end

  def diff_match_patch_body?(body)
    body.to_s.match?(Post::DIFF_MATCH_PATCH_PATTERN)
  end

  def parse_patches(patch_body)
    patches = []
    current_patch = nil

    patch_body.each_line(chomp: true) do |line|
      if match = line.match(/\A@@ -(?<old_start>\d+)(?:,(?<old_length>\d+))? \+(?<new_start>\d+)(?:,(?<new_length>\d+))? @@/)
        current_patch = {
          old_start: match[:old_start].to_i,
          old_length: (match[:old_length] || 1).to_i,
          new_start: match[:new_start].to_i,
          new_length: (match[:new_length] || 1).to_i,
          lines: []
        }
        patches << current_patch
        next
      end

      next unless current_patch
      next if line.empty?

      action = line[0]
      next unless [' ', '-', '+'].include?(action)

      current_patch[:lines] << {action: action, text: URI::DEFAULT_PARSER.unescape(line[1..].to_s)}
    end

    patches
  end

  def locate_patch(body, patch, expected, expected_index)
    return [expected_index, 0] if expected.empty?
    return [expected_index, expected.length] if body[expected_index, expected.length] == expected

    nearby_start = [expected_index - 256, 0].max
    nearby_index = nearest_index(body, expected, expected_index, nearby_start, expected_index + 256)
    return [nearby_index, expected.length] if nearby_index

    whitespace_match = locate_with_flexible_spaces(body, expected, expected_index, nearby_start, expected_index + 256)
    return whitespace_match if whitespace_match

    anchored_patch_match(body, patch, expected_index) || body.index(expected)&.then { |index| [index, expected.length] }
  end

  def nearest_index(body, needle, expected_index, start_index, end_index)
    return nil if needle.empty?

    indexes = []
    index = body.index(needle, start_index)
    while index && index <= end_index
      indexes << index
      index = body.index(needle, index + 1)
    end

    indexes.min_by { |candidate| (candidate - expected_index).abs }
  end

  def anchored_patch_match(body, patch, expected_index)
    prefix = patch[:lines].take_while { |line| line[:action] == ' ' }.map { |line| line[:text] }.join
    suffix = patch[:lines].reverse.take_while { |line| line[:action] == ' ' }.reverse.map { |line| line[:text] }.join
    return nil if prefix.length < 8 || suffix.length < 8

    window_start = [expected_index - 512, 0].max
    window_end = expected_index + 512
    prefix_index = prefix.present? ? nearest_index(body, prefix, expected_index, window_start, window_end) : expected_index
    return nil unless prefix_index

    suffix_start = prefix_index + prefix.length
    suffix_index = suffix.present? ? body.index(suffix, suffix_start) : suffix_start
    return nil unless suffix_index && suffix_index <= window_end + prefix.length

    [prefix_index, suffix_index + suffix.length - prefix_index]
  end

  def locate_with_flexible_spaces(body, expected, expected_index, start_index, end_index)
    return nil unless expected.include?(' ')

    window = body[start_index, end_index - start_index + expected.length] || ''
    pattern = Regexp.new(flexible_space_pattern(expected))
    matches = []
    window.to_enum(:scan, pattern).each do
      match = Regexp.last_match
      matches << [start_index + match.begin(0), match[0].length]
    end

    matches.min_by { |index, _length| (index - expected_index).abs }
  end

  def flexible_space_pattern(value)
    value.each_char.chunk { |char| char == ' ' }.map do |space, chars|
      space ? ' +' : Regexp.escape(chars.join)
    end.join
  end
end
