import { act, renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { useCurationSelection } from './useCurationSelection'

const posts = [{id: 1}, {id: 2}, {id: 3}]

describe('useCurationSelection', () => {
  test('selects the first loaded post and resets row selections', () => {
    const {result} = renderHook(() => useCurationSelection())

    act(() => result.current.togglePostSelection(2, posts))
    expect(result.current.selectedPostIds).toEqual(new Set([2]))

    act(() => result.current.applyLoadedSelection({posts}))
    expect(result.current.selectedId).toBe(1)
    expect(result.current.selectedPostIds).toEqual(new Set())
    expect(result.current.allMatchingSelected).toBe(false)
  })

  test('toggles individual, loaded, and all-matching selections', () => {
    const {result} = renderHook(() => useCurationSelection())

    act(() => result.current.togglePostSelection(2, posts))
    expect(result.current.selectedPostIds).toEqual(new Set([2]))

    act(() => result.current.toggleLoadedSelection(posts, false))
    expect(result.current.selectedPostIds).toEqual(new Set([1, 2, 3]))
    expect(result.current.allMatchingSelected).toBe(false)

    act(() => result.current.selectAllMatching(posts))
    expect(result.current.selectedPostIds).toEqual(new Set([1, 2, 3]))
    expect(result.current.allMatchingSelected).toBe(true)

    act(() => result.current.clearSelection())
    expect(result.current.selectedPostIds).toEqual(new Set())
    expect(result.current.allMatchingSelected).toBe(false)
  })

  test('applies read transitions and reports preview clearing', () => {
    const {result} = renderHook(() => useCurationSelection())

    act(() => result.current.applyLoadedSelection({posts}))
    act(() => result.current.applyReadTransition({selectedId: 3, clearPreview: false}))
    expect(result.current.selectedId).toBe(3)

    let clearPreview
    act(() => {
      clearPreview = result.current.applyReadTransition({selectedId: null, clearPreview: true})
    })
    expect(clearPreview).toBe(true)
    expect(result.current.selectedId).toBeNull()
  })

  test('removes selected post ids and exits all-matching mode', () => {
    const {result} = renderHook(() => useCurationSelection())

    act(() => result.current.selectAllMatching(posts))
    act(() => result.current.clearAllMatchingSelection())
    act(() => result.current.removeSelectedPostId(2))

    expect(result.current.allMatchingSelected).toBe(false)
    expect(result.current.selectedPostIds).toEqual(new Set([1, 3]))
  })
})
