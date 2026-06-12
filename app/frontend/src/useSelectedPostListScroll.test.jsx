import { render } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useSelectedPostListScroll } from './useSelectedPostListScroll'

function ListShell({selectedId = null, includeSelectedRow = true}) {
  const listScrollRef = useSelectedPostListScroll(selectedId)

  return (
    <div ref={listScrollRef}>
      {includeSelectedRow && <button data-selected={selectedId ? 'true' : undefined}>Selected row</button>}
    </div>
  )
}

afterEach(() => {
  delete Element.prototype.scrollIntoView
})

describe('useSelectedPostListScroll', () => {
  test('does not scroll before a post is selected', () => {
    Element.prototype.scrollIntoView = vi.fn()

    render(<ListShell />)

    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })

  test('scrolls the selected row into view', () => {
    Element.prototype.scrollIntoView = vi.fn()

    render(<ListShell selectedId={12} />)

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({block: 'center'})
  })

  test('tolerates a selected id without a rendered row', () => {
    Element.prototype.scrollIntoView = vi.fn()

    expect(() => render(<ListShell selectedId={12} includeSelectedRow={false} />)).not.toThrow()
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })
})
