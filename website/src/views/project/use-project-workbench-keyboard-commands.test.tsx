import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useProjectWorkbenchKeyboardCommands } from './use-project-workbench-keyboard-commands'
import type { CADDocumentNode, ProjectCADDocument } from 'src/types/project'

describe('useProjectWorkbenchKeyboardCommands', () => {
  it('runs Undo and Redo shortcuts only when history can move', () => {
    const changeHistory = vi.fn()
    renderHook(() =>
      useProjectWorkbenchKeyboardCommands({
        changeHistory,
        clearDeleteError: vi.fn(),
        deleteNode: vi.fn(),
        isCADDocumentCommandPending: false,
        projectCADDocument: cadDocument({ head_id: 'history_undo', can_undo: true, can_redo: false }),
      }),
    )

    const undoEvent = keyboardEvent('z', { metaKey: true })
    window.dispatchEvent(undoEvent)
    expect(undoEvent.defaultPrevented).toBe(true)
    expect(changeHistory).toHaveBeenCalledWith('undo')

    const redoEvent = keyboardEvent('z', { metaKey: true, shiftKey: true })
    window.dispatchEvent(redoEvent)
    expect(redoEvent.defaultPrevented).toBe(false)
    expect(changeHistory).toHaveBeenCalledTimes(1)
  })

  it('deletes the selected CAD document node from Delete or Backspace', () => {
    const clearDeleteError = vi.fn()
    const deleteNode = vi.fn()
    renderHook(() =>
      useProjectWorkbenchKeyboardCommands({
        changeHistory: vi.fn(),
        clearDeleteError,
        deleteNode,
        isCADDocumentCommandPending: false,
        keyboardDeleteNode: cadNode('node_delete'),
      }),
    )

    const deleteEvent = keyboardEvent('Delete')
    window.dispatchEvent(deleteEvent)

    expect(deleteEvent.defaultPrevented).toBe(true)
    expect(clearDeleteError).toHaveBeenCalledTimes(1)
    expect(deleteNode).toHaveBeenCalledWith('node_delete')
  })

  it('does not run commands while a CAD document command is pending', () => {
    const changeHistory = vi.fn()
    const clearDeleteError = vi.fn()
    const deleteNode = vi.fn()
    renderHook(() =>
      useProjectWorkbenchKeyboardCommands({
        changeHistory,
        clearDeleteError,
        deleteNode,
        isCADDocumentCommandPending: true,
        keyboardDeleteNode: cadNode('node_pending'),
        projectCADDocument: cadDocument({ head_id: 'history_pending', can_undo: true, can_redo: true }),
      }),
    )

    window.dispatchEvent(keyboardEvent('z', { metaKey: true }))
    window.dispatchEvent(keyboardEvent('Delete'))

    expect(changeHistory).not.toHaveBeenCalled()
    expect(clearDeleteError).not.toHaveBeenCalled()
    expect(deleteNode).not.toHaveBeenCalled()
  })
})

function keyboardEvent(key: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    ...init,
  })
}

function cadDocument(history: ProjectCADDocument['history']): ProjectCADDocument {
  return {
    id: 'doc_keyboard',
    project_id: 'prj_keyboard',
    schema_version: 1,
    revision: 1,
    unit: 'millimetre',
    nodes: [],
    operations: [],
    history,
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}

function cadNode(id: string): CADDocumentNode {
  return {
    id,
    model_id: 'model_keyboard',
    parent_node_id: '',
    name: 'Keyboard node',
    source_format: 'step',
    transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
  }
}
