import { describe, expect, test } from 'vitest'
import { scrollPreviewPane } from './previewScroll'

function pane({scrollTop = 0, clientHeight = 100, scrollHeight = 500} = {}) {
  return {scrollTop, clientHeight, scrollHeight}
}

describe('scrollPreviewPane', () => {
  test('advances selection when there is no scroll pane', () => {
    expect(scrollPreviewPane(null, 1)).toEqual({advanceSelection: true})
  })

  test('scrolls within the pane before advancing selection', () => {
    const previewPane = pane()

    expect(scrollPreviewPane(previewPane, 1)).toEqual({advanceSelection: false})
    expect(previewPane.scrollTop).toBe(180)

    expect(scrollPreviewPane(previewPane, -1)).toEqual({advanceSelection: false})
    expect(previewPane.scrollTop).toBe(0)
  })

  test('advances selection at top and bottom boundaries', () => {
    expect(scrollPreviewPane(pane({scrollTop: 0}), -1)).toEqual({advanceSelection: true})
    expect(scrollPreviewPane(pane({scrollTop: 400}), 1)).toEqual({advanceSelection: true})
    expect(scrollPreviewPane(pane({scrollTop: 399.5}), 1)).toEqual({advanceSelection: true})
  })

  test('clamps scrolling to pane bounds', () => {
    const previewPane = pane({scrollTop: 350})

    expect(scrollPreviewPane(previewPane, 1)).toEqual({advanceSelection: false})
    expect(previewPane.scrollTop).toBe(400)
  })
})
