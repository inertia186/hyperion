const KEY = {
  enter: 13,
  escape: 27,
  space: 32,
  pageUp: 33,
  pageDown: 34,
  left: 37,
  up: 38,
  right: 39,
  down: 40,
  h: 72,
  j: 74,
  k: 75,
  l: 76,
  comma: 188,
  period: 190
};

export function isPreviewPreviousKey(event) {
  return [KEY.left, KEY.h, KEY.j, KEY.up].includes(event.keyCode);
}

export function isPreviewNextKey(event) {
  return [KEY.l, KEY.right, KEY.down, KEY.j].includes(event.keyCode);
}

export function isMarkReadAndPreviewPreviousKey(event) {
  return event.shiftKey && event.keyCode === KEY.comma;
}

export function isMarkReadAndPreviewNextKey(event) {
  return event.shiftKey && event.keyCode === KEY.period;
}

export function isFocusPreviousKey(event) {
  return [KEY.up, KEY.k].includes(event.keyCode);
}

export function isFocusNextKey(event) {
  return [KEY.j, KEY.down].includes(event.keyCode);
}

export function isPreviewDismissKey(event) {
  return [KEY.escape, KEY.enter].includes(event.keyCode);
}

export function isPreviewScrollKey(event) {
  return [KEY.space, KEY.pageUp, KEY.pageDown].includes(event.keyCode);
}

export function isScrollDownKey(event) {
  return (event.keyCode === KEY.space && !event.shiftKey) || event.keyCode === KEY.pageDown;
}

export function isScrollUpKey(event) {
  return (event.keyCode === KEY.space && event.shiftKey) || event.keyCode === KEY.pageUp;
}
