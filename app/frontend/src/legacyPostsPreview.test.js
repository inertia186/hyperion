import { describe, expect, test, vi } from 'vitest'
import { bindPreviewListeners, clearPreviewIframe, isPreviewBackdropClick, loadPreviewIframe, unbindPreviewListeners } from '../../javascript/controllers/posts_preview'

function jqueryStub() {
  const iframe = {
    src: null,
    source: '/preview.html',
    attr: vi.fn((name, value) => {
      if (value !== undefined) iframe[name] = value
      return iframe[name]
    }),
    data: vi.fn((name) => name === 'src' ? iframe.source : undefined)
  }
  const $ = vi.fn(() => iframe)

  return {$, iframe}
}

describe('legacy posts preview helpers', () => {
  test('loads and clears preview iframe sources', () => {
    const {$, iframe} = jqueryStub()

    expect(loadPreviewIframe($, 'abc')).toBe(iframe)
    expect($).toHaveBeenCalledWith('#preview-abc iframe')
    expect(iframe.attr).toHaveBeenCalledWith('src', '/preview.html')

    clearPreviewIframe($, 'abc')
    expect(iframe.attr).toHaveBeenCalledWith('src', 'about:blank')
  })

  test('detects bootstrap backdrop clicks for a post preview', () => {
    expect(isPreviewBackdropClick({target: {id: 'preview-42'}}, '42')).toBe(true)
    expect(isPreviewBackdropClick({target: {id: 'preview-41'}}, '42')).toBe(false)
    expect(isPreviewBackdropClick({}, '42')).toBe(false)
  })

  test('binds and unbinds preview listeners', () => {
    const target = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
    const controller = {
      scrollKey: vi.fn(),
      previewDismissKey: vi.fn(),
      previewPreviousKey: vi.fn(),
      previewNextKey: vi.fn(),
      markAsReadAndPreviewPreviousKey: vi.fn(),
      markAsReadAndPreviewNextKey: vi.fn(),
      previewDismissOutsideModal: vi.fn()
    }

    const bindings = bindPreviewListeners(target, controller)
    expect(target.addEventListener).toHaveBeenCalledTimes(7)
    expect(target.addEventListener.mock.calls.map(([eventName]) => eventName)).toEqual([
      'keydown',
      'keydown',
      'keydown',
      'keydown',
      'keydown',
      'keydown',
      'click'
    ])

    unbindPreviewListeners(target, bindings)
    expect(target.removeEventListener).toHaveBeenCalledTimes(7)
    expect(target.removeEventListener.mock.calls.map(([eventName]) => eventName)).toEqual([
      'keydown',
      'keydown',
      'keydown',
      'keydown',
      'keydown',
      'keydown',
      'click'
    ])
  })
})
