// Shared by the React preview and the legacy sandbox. Call only on sanitized HTML.
window.HyperionPostHeadings = (() => {
  const headingSelector = 'h1, h2, h3, h4, h5, h6'

  function addIds(root) {
    const used = new Set()
    const lastSuffixes = new Map()
    root.querySelectorAll(headingSelector).forEach((heading) => {
      // Keep this convention in sync with PostHeadingAnchors (shared fixtures).
      // Match Ruby String#strip rather than JavaScript's Unicode whitespace trim.
      const base = heading.textContent.replace(/^[\0\t\n\v\f\r ]+|[\0\t\n\v\f\r ]+$/g, '').replace(/^[^a-zA-Z]+/, '')
        .replace(/[^a-zA-Z0-9 -]/g, '').replace(/ /g, '-').toLowerCase() || 'section'
      let id = base
      let suffix = lastSuffixes.get(base) || 0
      while (used.has(id)) id = `${base}-${++suffix}`
      used.add(id)
      lastSuffixes.set(base, suffix)
      heading.id = id
    })
  }

  function scrollToFragment(root, hash) {
    if (!root || !hash || !hash.startsWith('#')) return false
    let id
    try {
      id = decodeURIComponent(hash.slice(1))
    } catch (_error) {
      return false
    }
    if (!id) return false
    const heading = Array.from(root.querySelectorAll(headingSelector)).find((node) => node.id === id)
    if (!heading) return false
    heading.scrollIntoView({block: 'start'})
    return true
  }

  function followFragment(event, root) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
    const link = event.target.closest('a[href^="#"]')
    if (!link || !root.contains(link)) return false
    if (!scrollToFragment(root, link.getAttribute('href'))) return false
    event.preventDefault()
    return true
  }

  return {addIds, scrollToFragment, followFragment}
})()
