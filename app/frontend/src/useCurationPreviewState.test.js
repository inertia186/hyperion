import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useCurationPreviewState } from './useCurationPreviewState'

afterEach(() => {
  document.body.className = ''
})

describe('useCurationPreviewState', () => {
  test('opens, toggles, and closes desktop preview without opening the mobile overlay', () => {
    const setSelectedId = vi.fn()
    const {result} = renderHook(() => useCurationPreviewState({isMobilePreviewLayout: false, setSelectedId}))

    act(() => result.current.openPreview())
    expect(result.current.previewActive).toBe(true)
    expect(result.current.mobilePreviewOpen).toBe(false)

    act(() => result.current.selectPost(2))
    expect(setSelectedId).toHaveBeenCalledWith(2)
    expect(result.current.mobilePreviewOpen).toBe(false)

    act(() => result.current.togglePreview())
    expect(result.current.previewActive).toBe(false)
  })

  test('tracks mobile preview state and body class', () => {
    const setSelectedId = vi.fn()
    const {result, rerender} = renderHook(({mobile}) => useCurationPreviewState({isMobilePreviewLayout: mobile, setSelectedId}), {
      initialProps: {mobile: true}
    })

    act(() => result.current.selectPost(4))
    expect(setSelectedId).toHaveBeenCalledWith(4)
    expect(result.current.previewActive).toBe(true)
    expect(result.current.mobilePreviewOpen).toBe(true)
    expect(document.body.classList.contains('mobile-preview-open')).toBe(true)

    rerender({mobile: false})
    expect(result.current.mobilePreviewOpen).toBe(false)
    expect(document.body.classList.contains('mobile-preview-open')).toBe(false)
  })
})
