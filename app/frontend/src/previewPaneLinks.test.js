import { describe, expect, test } from 'vitest'
import { blacklistReasonText, crossPostText, previewExternalLinks, replyCommentsUrl } from './previewPaneLinks'

describe('preview pane links', () => {
  test('adds canonical links only when they point outside built-in hosts', () => {
    const urls = {
      hive_blog: 'https://hive.blog/hive-123/@alice/post',
      peakd: 'https://peakd.com/hive-123/@alice/post',
      hiveblocks: 'https://hiveblocks.com/@alice/post',
      hive_db: 'https://hivehub.dev/@alice/post',
      canonical: 'https://example.com/alice/post'
    }

    expect(previewExternalLinks(urls, {}).map((link) => link.key)).toEqual(['canonical', 'hive_blog', 'peakd', 'hiveblocks', 'hive_db'])
    expect(previewExternalLinks({...urls, canonical: 'https://www.peakd.com/hive-123/@alice/post'}, {}).map((link) => link.key)).toEqual(['hive_blog', 'peakd', 'hiveblocks', 'hive_db'])
  })

  test('builds comments URLs from explicit or derived Hive blog URLs', () => {
    expect(replyCommentsUrl({hive_blog: 'https://hive.blog/hive-123/@alice/post#old'}, null)).toBe('https://hive.blog/hive-123/@alice/post#comments')
    expect(replyCommentsUrl({}, {category: 'hive-123', author: 'alice', permlink: 'post'})).toBe('https://hive.blog/hive-123/@alice/post#comments')
    expect(replyCommentsUrl({}, null)).toBe('#comments')
  })

  test('formats blacklist reasons with unique account names', () => {
    expect(blacklistReasonText([{name: 'spaminator'}, {account: 'hivewatchers'}, {name: 'spaminator'}])).toBe('Blacklisted: author appears on spaminator, hivewatchers.')
    expect(blacklistReasonText([])).toBe('Blacklisted: author appears on a Hive blacklist.')
  })

  test('formats cross post provenance', () => {
    expect(crossPostText({source_author: 'alice', source_permlink: 'original'})).toBe('Cross-post: showing original content from @alice/original.')
    expect(crossPostText(null)).toBe('Cross-post: showing original content.')
  })
})
