import { describe, expect, test, vi } from 'vitest'
import { adjacentPostActionLink, focusAndClickLink, focusLink, postActionLink, postIdFromRow } from '../../javascript/controllers/posts_navigation'

function buildRows() {
  document.body.innerHTML = `
    <table>
      <tbody>
        <tr data-posts-id-value="one"></tr>
        <tr data-posts-id-value="two"></tr>
        <tr data-posts-id-value="three"></tr>
      </tbody>
    </table>
    <button id="#show-one"></button>
    <button id="#show-two"></button>
    <button id="#show-three"></button>
    <button id="#mark-as-read-two"></button>
  `

  return [...document.querySelectorAll('tr')]
}

describe('legacy posts navigation helpers', () => {
  test('reads post ids from legacy row data attributes', () => {
    const [, row] = buildRows()

    expect(postIdFromRow(row)).toBe('two')
    expect(postIdFromRow(null)).toBeNull()
  })

  test('finds current and adjacent post action links', () => {
    const [first, second, third] = buildRows()

    expect(postActionLink(second, 'show')).toBe(document.getElementById('#show-two'))
    expect(postActionLink(second, 'mark-as-read')).toBe(document.getElementById('#mark-as-read-two'))
    expect(adjacentPostActionLink(second, -1, 'show')).toBe(document.getElementById('#show-one'))
    expect(adjacentPostActionLink(second, 1, 'show')).toBe(document.getElementById('#show-three'))
    expect(adjacentPostActionLink(first, -1, 'show')).toBeNull()
    expect(adjacentPostActionLink(third, 1, 'show')).toBeNull()
  })

  test('focuses and clicks links when present', () => {
    buildRows()
    const link = document.getElementById('#show-two')
    link.focus = vi.fn()
    link.click = vi.fn()

    focusLink(link)
    expect(link.focus).toHaveBeenCalledTimes(1)

    focusAndClickLink(link)
    expect(link.focus).toHaveBeenCalledTimes(2)
    expect(link.click).toHaveBeenCalledTimes(1)

    expect(() => focusLink(null)).not.toThrow()
    expect(() => focusAndClickLink(null)).not.toThrow()
  })
})
