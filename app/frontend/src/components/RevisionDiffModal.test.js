import { describe, expect, test } from 'vitest'
import { lineDiff } from './RevisionDiffModal'

describe('lineDiff', () => {
  test('keeps stable lines and marks additions and removals', () => {
    expect(lineDiff('shared\nold\nsame', 'shared\nnew\nsame')).toEqual([
      {type: 'same', prefix: ' ', text: 'shared', number: 1},
      {type: 'removed', prefix: '-', text: 'old', number: 2},
      {type: 'added', prefix: '+', text: 'new', number: 2},
      {type: 'same', prefix: ' ', text: 'same', number: 3}
    ])
  })
})
