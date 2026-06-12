import { describe, expect, test } from 'vitest'
import { diffPairOptions, escapeHtml, lineDiff, normalizePairIndex, renderCodeDiff, renderCodeRevision, revisionDetail } from '../../javascript/controllers/posts_diff'

describe('legacy posts diff helpers', () => {
  test('escapes html in text and attributes', () => {
    expect(escapeHtml('<script>"bad" & ok</script>')).toBe('&lt;script&gt;&quot;bad&quot; &amp; ok&lt;/script&gt;')
  })

  test('builds line diffs with same, removed, and added rows', () => {
    expect(lineDiff('same\nold\nlast', 'same\nnew\nlast')).toEqual([
      {type: 'same', prefix: ' ', text: 'same', number: 1},
      {type: 'removed', prefix: '-', text: 'old', number: 2},
      {type: 'added', prefix: '+', text: 'new', number: 2},
      {type: 'same', prefix: ' ', text: 'last', number: 3}
    ])
  })

  test('renders revision metadata and safe revision body html', () => {
    expect(revisionDetail({published_at: '2026-06-12T12:00:00Z', block_num: 42})).toBe('2026-06-12T12:00:00Z · block 42')
    expect(revisionDetail({})).toBe('No chain metadata')
    expect(renderCodeRevision({body: '<b>unsafe</b>'})).toContain('&lt;b&gt;unsafe&lt;/b&gt;')
  })

  test('normalizes pair index and renders pair options', () => {
    const revisions = [{label: 'One'}, {label: 'Two'}, {label: 'Three'}]

    expect(normalizePairIndex(revisions, null)).toBe(1)
    expect(normalizePairIndex(revisions, -3)).toBe(0)
    expect(normalizePairIndex(revisions, 99)).toBe(1)
    expect(diffPairOptions(revisions, 1)).toContain('<option value="1" selected>Two -&gt; Three</option>')
  })

  test('renders escaped code diffs', () => {
    const html = renderCodeDiff(
      {label: 'Before <bad>', body: 'safe\nremoved', published_at: 'before'},
      {label: 'After', body: 'safe\n<added>', block_num: 7}
    )

    expect(html).toContain('Before &lt;bad&gt;')
    expect(html).toContain('before')
    expect(html).toContain('block 7')
    expect(html).toContain('-removed')
    expect(html).toContain('+&lt;added&gt;')
  })
})
