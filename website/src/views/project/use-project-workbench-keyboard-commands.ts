import { useEffect } from 'react'

import { cadHistoryActionForKey, type CADHistoryAction } from './cad-document-history'
import { isCADDocumentNodeDeletable } from './project-cad-node-actions'
import { shouldDeleteSelectedCADNodeFromKey } from './project-delete-keyboard'
import type { CADDocumentNode, ProjectCADDocument } from 'src/types/project'

type ProjectWorkbenchKeyboardCommandsOptions = {
  changeHistory: (action: CADHistoryAction) => void
  clearDeleteError: () => void
  deleteNode: (nodeID: string) => void
  isCADDocumentCommandPending: boolean
  keyboardDeleteNode?: CADDocumentNode
  projectCADDocument?: ProjectCADDocument
}

export function useProjectWorkbenchKeyboardCommands({
  changeHistory,
  clearDeleteError,
  deleteNode,
  isCADDocumentCommandPending,
  keyboardDeleteNode,
  projectCADDocument,
}: ProjectWorkbenchKeyboardCommandsOptions) {
  useEffect(() => {
    const handleHistoryKeyDown = (event: KeyboardEvent) => {
      const action = cadHistoryActionForKey(event)
      if (!action || isCADDocumentCommandPending) {
        return
      }
      const canRun = action === 'undo' ? projectCADDocument?.history.can_undo : projectCADDocument?.history.can_redo
      if (!canRun) {
        return
      }
      event.preventDefault()
      changeHistory(action)
    }

    window.addEventListener('keydown', handleHistoryKeyDown)
    return () => window.removeEventListener('keydown', handleHistoryKeyDown)
  }, [changeHistory, isCADDocumentCommandPending, projectCADDocument?.history.can_redo, projectCADDocument?.history.can_undo])

  useEffect(() => {
    if (!keyboardDeleteNode || !isCADDocumentNodeDeletable(keyboardDeleteNode) || isCADDocumentCommandPending) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldDeleteSelectedCADNodeFromKey(event)) {
        return
      }
      event.preventDefault()
      clearDeleteError()
      deleteNode(keyboardDeleteNode.id)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearDeleteError, deleteNode, isCADDocumentCommandPending, keyboardDeleteNode])
}
