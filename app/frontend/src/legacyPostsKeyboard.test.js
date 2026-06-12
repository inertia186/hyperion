import { describe, expect, test } from 'vitest'
import {
  isFocusNextKey,
  isFocusPreviousKey,
  isMarkReadAndPreviewNextKey,
  isMarkReadAndPreviewPreviousKey,
  isPreviewDismissKey,
  isPreviewNextKey,
  isPreviewPreviousKey,
  isPreviewScrollKey,
  isScrollDownKey,
  isScrollUpKey
} from '../../javascript/controllers/posts_keyboard'

const key = (keyCode, shiftKey = false) => ({keyCode, shiftKey})

describe('legacy posts keyboard helpers', () => {
  test('matches preview navigation shortcuts', () => {
    expect([37, 72, 74, 38].every((keyCode) => isPreviewPreviousKey(key(keyCode)))).toBe(true)
    expect([76, 39, 40, 74].every((keyCode) => isPreviewNextKey(key(keyCode)))).toBe(true)
    expect(isPreviewPreviousKey(key(13))).toBe(false)
    expect(isPreviewNextKey(key(13))).toBe(false)
  })

  test('matches read-and-preview shortcuts only with shift', () => {
    expect(isMarkReadAndPreviewPreviousKey(key(188, true))).toBe(true)
    expect(isMarkReadAndPreviewNextKey(key(190, true))).toBe(true)
    expect(isMarkReadAndPreviewPreviousKey(key(188))).toBe(false)
    expect(isMarkReadAndPreviewNextKey(key(190))).toBe(false)
  })

  test('matches focus shortcuts', () => {
    expect([38, 75].every((keyCode) => isFocusPreviousKey(key(keyCode)))).toBe(true)
    expect([74, 40].every((keyCode) => isFocusNextKey(key(keyCode)))).toBe(true)
    expect(isFocusPreviousKey(key(74))).toBe(false)
    expect(isFocusNextKey(key(75))).toBe(false)
  })

  test('matches dismiss and scroll shortcuts', () => {
    expect([27, 13].every((keyCode) => isPreviewDismissKey(key(keyCode)))).toBe(true)
    expect([32, 33, 34].every((keyCode) => isPreviewScrollKey(key(keyCode)))).toBe(true)

    expect(isScrollDownKey(key(32))).toBe(true)
    expect(isScrollDownKey(key(34))).toBe(true)
    expect(isScrollDownKey(key(32, true))).toBe(false)

    expect(isScrollUpKey(key(32, true))).toBe(true)
    expect(isScrollUpKey(key(33))).toBe(true)
    expect(isScrollUpKey(key(32))).toBe(false)
  })
})
