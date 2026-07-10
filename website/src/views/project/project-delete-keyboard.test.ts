import { describe, expect, test } from 'vitest'

import { shouldDeleteSelectedCADNodeFromKey } from './project-delete-keyboard'

describe('shouldDeleteSelectedCADNodeFromKey', () => {
  test.each(['Delete', 'Backspace'])('deletes the selected CAD node with %s', (key) => {
    expect(
      shouldDeleteSelectedCADNodeFromKey({
        key,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        isComposing: false,
        target: null,
      }),
    ).toBe(true)
  })

  test.each(['INPUT', 'TEXTAREA', 'SELECT'])('does not delete while editing a %s', (tagName) => {
    expect(
      shouldDeleteSelectedCADNodeFromKey({
        key: 'Backspace',
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        isComposing: false,
        target: { tagName, isContentEditable: false },
      }),
    ).toBe(false)
  })

  test('does not delete while editing contenteditable content', () => {
    expect(
      shouldDeleteSelectedCADNodeFromKey({
        key: 'Delete',
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        isComposing: false,
        target: { tagName: 'DIV', isContentEditable: true },
      }),
    ).toBe(false)
  })

  test('ignores modified, composing, and unrelated key presses', () => {
    const baseEvent = {
      key: 'Delete',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      isComposing: false,
      target: null,
    }

    expect(shouldDeleteSelectedCADNodeFromKey({ ...baseEvent, ctrlKey: true })).toBe(false)
    expect(shouldDeleteSelectedCADNodeFromKey({ ...baseEvent, isComposing: true })).toBe(false)
    expect(shouldDeleteSelectedCADNodeFromKey({ ...baseEvent, key: 'Enter' })).toBe(false)
  })
})
