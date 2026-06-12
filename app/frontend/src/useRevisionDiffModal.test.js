import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { useRevisionDiffModal } from './useRevisionDiffModal'

describe('useRevisionDiffModal', () => {
  test('loads revisions and defaults to the latest pair', async () => {
    const payload = {revisions: [{id: 1}, {id: 2}, {id: 3}]}
    const postRevisionsApi = vi.fn(() => Promise.resolve(payload))
    const {result} = renderHook(() => useRevisionDiffModal({postRevisionsApi}))

    act(() => {
      result.current.openDiffModal({id: 42})
    })

    expect(result.current.diffModal).toEqual({status: 'loading', payload: null, error: null, selectedIndex: null})
    await waitFor(() => expect(result.current.diffModal.status).toBe('ready'))
    expect(result.current.diffModal).toEqual({status: 'ready', payload, error: null, selectedIndex: 1})
    expect(postRevisionsApi).toHaveBeenCalledWith(42)

    act(() => {
      result.current.selectDiffPair(0)
    })
    expect(result.current.diffModal.selectedIndex).toBe(0)

    act(() => {
      result.current.closeDiffModal()
    })
    expect(result.current.diffModal).toBeNull()
  })

  test('uses the first pair for short revision lists', async () => {
    const payload = {revisions: [{id: 1}]}
    const postRevisionsApi = vi.fn(() => Promise.resolve(payload))
    const {result} = renderHook(() => useRevisionDiffModal({postRevisionsApi}))

    act(() => {
      result.current.openDiffModal({id: 42})
    })

    await waitFor(() => expect(result.current.diffModal.status).toBe('ready'))
    expect(result.current.diffModal.selectedIndex).toBe(0)
  })

  test('captures revision load errors', async () => {
    const postRevisionsApi = vi.fn(() => Promise.reject(new Error('No revisions today.')))
    const {result} = renderHook(() => useRevisionDiffModal({postRevisionsApi}))

    act(() => {
      result.current.openDiffModal({id: 42})
    })

    await waitFor(() => expect(result.current.diffModal.status).toBe('error'))
    expect(result.current.diffModal).toEqual({status: 'error', payload: null, error: 'No revisions today.', selectedIndex: null})
  })
})
