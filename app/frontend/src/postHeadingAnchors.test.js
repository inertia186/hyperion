import { afterEach, describe, expect, test, vi } from 'vitest'
import cases from '../../../test/fixtures/files/post_heading_anchors.json'
import '../../assets/javascripts/post-heading-anchors'
import { renderPostBody } from './renderPostBody'

const {addIds, followFragment, scrollToFragment} = window.HyperionPostHeadings
const rootFor = (html) => {
  const root = document.createElement('article')
  root.innerHTML = html
  return root
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('generated heading anchors', () => {
  test('repeated headings stay within the render budget', () => {
    const headings = Array.from({length: 25000}, () => ({textContent: 'a'}))
    const started = performance.now()
    addIds({querySelectorAll: () => headings})

    expect(performance.now() - started).toBeLessThan(5000)
    expect(headings.at(-1).id).toBe('user-content-a-24999')
  })

  test.each(cases)('matches server IDs for $html', ({html, ids}) => {
    const root = rootFor(html)
    addIds(root)
    expect(Array.from(root.querySelectorAll('[id]'), (heading) => heading.id)).toEqual(ids)
    addIds(root)
    expect(Array.from(root.querySelectorAll('[id]'), (heading) => heading.id)).toEqual(ids)
  })

  test('adds IDs after the real renderer sanitizes HTML and preserves local links', () => {
    const root = rootFor(renderPostBody('# Real Heading\n\n[Jump](#real-heading)\n\n## Real Heading\n\n<div id="supplied">Plain</div>\n\n<h3 id="supplied-heading">Custom</h3>'))
    expect(Array.from(root.querySelectorAll('h1, h2, h3'), (heading) => heading.id)).toEqual(['user-content-real-heading', 'user-content-real-heading-1', 'user-content-custom'])
    expect(root.querySelector('a').getAttribute('href')).toBe('#real-heading')
    expect(root.querySelector('#supplied, #supplied-heading, div[id]')).toBeNull()
  })

  test('fragment clicks scroll inside their post rather than following an external base URL', () => {
    const root = rootFor('<a href="#real%2Dheading"><em>Jump</em></a><h1>Real Heading</h1>')
    addIds(root)
    const heading = root.querySelector('h1')
    heading.scrollIntoView = vi.fn()
    const event = {target: root.querySelector('em'), button: 0, preventDefault: vi.fn()}
    expect(followFragment(event, root)).toBe(true)
    expect(heading.scrollIntoView).toHaveBeenCalledWith({block: 'start'})
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  test('direct fragments resolve only within the supplied post', () => {
    document.body.innerHTML = '<h1 id="real-heading">Unrelated</h1>'
    const root = rootFor('<h1>Real Heading</h1>')
    addIds(root)
    root.querySelector('h1').scrollIntoView = vi.fn()
    expect(scrollToFragment(root, '#real-heading')).toBe(true)
    expect(scrollToFragment(root, '#user-content-real-heading')).toBe(true)
    expect(scrollToFragment(root, '#missing')).toBe(false)
    expect(scrollToFragment(root, '#')).toBe(false)
    expect(scrollToFragment(root, '#%invalid')).toBe(false)
  })

  test('a bare slug that starts with the prefix still reaches its own heading', () => {
    const root = rootFor('<h1>Policy</h1><h2>User Content Policy</h2>')
    addIds(root)
    const [policy, userContentPolicy] = root.querySelectorAll('h1, h2')
    policy.scrollIntoView = vi.fn()
    userContentPolicy.scrollIntoView = vi.fn()
    expect(scrollToFragment(root, '#user-content-policy')).toBe(true)
    expect(userContentPolicy.scrollIntoView).toHaveBeenCalledOnce()
    expect(policy.scrollIntoView).not.toHaveBeenCalled()
  })

  test('leaves modified and external link clicks alone', () => {
    const root = rootFor('<a href="#real-heading">Jump</a><h1>Real Heading</h1>')
    addIds(root)
    const event = {target: root.querySelector('a'), button: 0, ctrlKey: true, preventDefault: vi.fn()}
    expect(followFragment(event, root)).toBe(false)
    event.ctrlKey = false
    event.target.setAttribute('href', 'https://example.com/#real-heading')
    expect(followFragment(event, root)).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
