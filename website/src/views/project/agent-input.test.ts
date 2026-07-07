import { describe, expect, test } from 'vitest'

import { shouldSubmitAgentInputFromKey } from './agent-input'

describe('shouldSubmitAgentInputFromKey', () => {
  test('submits on Enter', () => {
    expect(shouldSubmitAgentInputFromKey({ key: 'Enter', shiftKey: false, isComposing: false })).toBe(true)
  })

  test('keeps Shift+Enter available for new lines', () => {
    expect(shouldSubmitAgentInputFromKey({ key: 'Enter', shiftKey: true, isComposing: false })).toBe(false)
  })

  test('does not submit while an input method is composing text', () => {
    expect(shouldSubmitAgentInputFromKey({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false)
  })

  test('ignores non-Enter keys', () => {
    expect(shouldSubmitAgentInputFromKey({ key: 'a', shiftKey: false, isComposing: false })).toBe(false)
  })
})
