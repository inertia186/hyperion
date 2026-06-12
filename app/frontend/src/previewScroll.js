export function scrollPreviewPane(pane, direction) {
  if (!pane) return {advanceSelection: true}

  const maxScrollTop = Math.max(pane.scrollHeight - pane.clientHeight, 0)
  const atTop = pane.scrollTop <= 0
  const atBottom = pane.scrollTop >= maxScrollTop - 1

  if ((direction > 0 && atBottom) || (direction < 0 && atTop)) {
    return {advanceSelection: true}
  }

  const before = pane.scrollTop
  const step = direction * Math.max(pane.clientHeight * 0.75, 180)
  pane.scrollTop = Math.min(Math.max(before + step, 0), maxScrollTop)

  return {advanceSelection: pane.scrollTop === before}
}

