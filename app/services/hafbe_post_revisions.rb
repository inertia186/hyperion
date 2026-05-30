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

    revisions = operation_revisions(fetch_operations(post.author, post.permlink), post)
    local_body = local_body.to_s
    if local_body.present? && revisions.none? { |revision| revision[:body].to_s.strip == local_body.strip }
      revisions << {
        body: local_body,
        title: post.title,
        published_at: post.updated_at&.iso8601 || post.created_at&.iso8601,
        block_num: post.block_num,
        trx_id: post.trx_id
      }
    end

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
        if revision[:body].match?(Post::DIFF_MATCH_PATCH_PATTERN) && unique_revisions.last
          revision[:body] = apply_patch(unique_revisions.last[:body].to_s, revision[:body].to_s) || revision[:body]
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

    {
      sequence: sequence,
      body: value['body'],
      title: value['title'],
      published_at: wrapper['timestamp'] || wrapper['block_time'] || value['timestamp'],
      block_num: wrapper['block_num'] || wrapper['block'] || value['block_num'] || value['block'],
      trx_id: wrapper['trx_id'] || wrapper['transaction_id'] || value['trx_id']
    }
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
      expected_index = locate_patch(patched_body, expected, expected_index)
      return nil unless expected_index

      patched_body[expected_index, expected.length] = replacement
      offset += replacement.length - expected.length
    end

    patched_body
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
      next if line.blank?

      action = line[0]
      next unless [' ', '-', '+'].include?(action)

      current_patch[:lines] << {action: action, text: URI::DEFAULT_PARSER.unescape(line[1..].to_s)}
    end

    patches
  end

  def locate_patch(body, expected, expected_index)
    return expected_index if expected.blank?
    return expected_index if body[expected_index, expected.length] == expected

    nearby_start = [expected_index - 256, 0].max
    nearby_index = body.index(expected, nearby_start)
    return nearby_index if nearby_index && nearby_index <= expected_index + 256

    body.index(expected)
  end
end
