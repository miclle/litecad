import { describe, expect, test } from 'vitest'

import { cadHistoryActionForKey, cadHistoryStatusLabel } from './cad-document-history'

function keyboardEvent(overrides: Partial<KeyboardEventInit> = {}, target?: HTMLElement) {
  const event = new KeyboardEvent('keydown', { key: 'z', ...overrides })
  if (target) {
    Object.defineProperty(event, 'target', { value: target })
  }
  return event
}

describe('CAD document history helpers', () => {
  test('maps Cmd+Z and Ctrl+Z to undo', () => {
    expect(cadHistoryActionForKey(keyboardEvent({ metaKey: true }))).toBe('undo')
    expect(cadHistoryActionForKey(keyboardEvent({ ctrlKey: true }))).toBe('undo')
  })

  test('maps Cmd+Shift+Z and Ctrl+Shift+Z to redo', () => {
    expect(cadHistoryActionForKey(keyboardEvent({ metaKey: true, shiftKey: true }))).toBe('redo')
    expect(cadHistoryActionForKey(keyboardEvent({ ctrlKey: true, shiftKey: true }))).toBe('redo')
  })

  test('does not intercept editable fields', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')

    expect(cadHistoryActionForKey(keyboardEvent({ metaKey: true }, input))).toBeUndefined()
    expect(cadHistoryActionForKey(keyboardEvent({ ctrlKey: true }, textarea))).toBeUndefined()
    expect(cadHistoryActionForKey(keyboardEvent({ metaKey: true }, editable))).toBeUndefined()
  })

  test('ignores unrelated or modified shortcuts', () => {
    expect(cadHistoryActionForKey(keyboardEvent({ key: 'y', ctrlKey: true }))).toBeUndefined()
    expect(cadHistoryActionForKey(keyboardEvent({ metaKey: true, altKey: true }))).toBeUndefined()
    expect(cadHistoryActionForKey(keyboardEvent())).toBeUndefined()
  })

  test('labels applied, undone, and discarded history entries', () => {
    expect(cadHistoryStatusLabel('applied')).toBe('Applied')
    expect(cadHistoryStatusLabel('undone')).toBe('Undone')
    expect(cadHistoryStatusLabel('discarded')).toBe('Alternate path')
  })
})
