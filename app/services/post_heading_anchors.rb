class PostHeadingAnchors
  # Authors control heading text, so namespace the IDs to keep them from
  # colliding with page IDs or clobbering window globals (e.g. window.peakvault).
  PREFIX = 'user-content-'

  # Run after sanitization: only generated heading IDs are added back.
  def self.call(html)
    fragment = Nokogiri::HTML::DocumentFragment.parse(html)
    used_ids = {}
    last_suffixes = {}

    fragment.css('h1, h2, h3, h4, h5, h6').each do |heading|
      # Match Kramdown's basic ASCII slug convention in both renderers.
      base = heading.text.strip.sub(/\A[^a-zA-Z]+/, '').gsub(/[^a-zA-Z0-9 -]/, '').tr(' ', '-').downcase
      base = 'section' if base.empty?
      id = base
      suffix = last_suffixes.fetch(base, 0)
      while used_ids[id]
        suffix += 1
        id = "#{base}-#{suffix}"
      end
      used_ids[id] = true
      last_suffixes[base] = suffix
      heading['id'] = PREFIX + id
    end

    fragment.to_html
  end
end
