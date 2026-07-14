import { useEffect } from 'react'

import { cadHistoryActionForKey, type CADHistoryAction } from './cad-document-history'
import { isCADDocumentNodeDeletable } from './project-cad-node-actions'
import { shouldDeleteSelectedCADNodeFromKey } from './project-delete-keyboard'
import type { CADAssemblyOccurrence, CADDocumentNode, ProjectCADDocument } from 'src/types/project'

type ProjectWorkbenchKeyboardCommandsOptions = {
  changeHistory: (action: CADHistoryAction) => void
  clearDeleteError: () => void
  deleteNode: (nodeID: string) => void
	deleteOccurrence?: (occurrenceID: string) => void
  isCADDocumentCommandPending: boolean
  keyboardDeleteNode?: CADDocumentNode
  projectCADDocument?: ProjectCADDocument
	selectedModelOccurrenceCount?: number
	selectedOccurrence?: CADAssemblyOccurrence
}

export function useProjectWorkbenchKeyboardCommands({
  changeHistory,
  clearDeleteError,
  deleteNode,
	deleteOccurrence,
  isCADDocumentCommandPending,
  keyboardDeleteNode,
  projectCADDocument,
	selectedModelOccurrenceCount = 0,
	selectedOccurrence,
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
			if (!keyboardDeleteNode.parent_node_id && selectedOccurrence && selectedModelOccurrenceCount > 1) {
				deleteOccurrence?.(selectedOccurrence.id)
				return
			}
			deleteNode(keyboardDeleteNode.id)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
	}, [clearDeleteError, deleteNode, deleteOccurrence, isCADDocumentCommandPending, keyboardDeleteNode, selectedModelOccurrenceCount, selectedOccurrence])
}
