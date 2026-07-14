import { useCallback, useMemo, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import type { CADDocumentNode, ProjectCADDocument } from 'src/types/project'
import {
  boxFeatureDraftFromCADBoxFeature,
  defaultBoxFeatureDraft,
  parseBoxFeatureDraft,
  type BoxFeatureDraft,
} from './cad-document-box-features'
import { translationFromCADTransform, type CADTranslation } from './cad-document-transforms'
import type { TransformDraft } from './project-inspector'
import { parseTransformDraft, transformDraftFromTranslation } from './use-project-workbench-inspector-state'

export type ProjectWorkbenchDraftCommandAdapter = {
  addBoxUnion: (modelId: string, box: NonNullable<ReturnType<typeof parseBoxFeatureDraft>>) => void
  cancelTransformAutosave: (nodeId: string) => void
  scheduleTransformAutosave: (nodeId: string, translation: CADTranslation) => void
  setBoxValidationError: (modelId: string, message: string) => void
  setTransformValidationError: (nodeId: string, message: string) => void
}

type UseProjectWorkbenchDraftCommandsOptions = {
  cadNodeByID: ReadonlyMap<string, CADDocumentNode>
  commandAdapterRef: RefObject<ProjectWorkbenchDraftCommandAdapter | null>
  onSelectionClear: () => void
  projectCADDocument?: ProjectCADDocument
  sourceNodeIDByModelID: ReadonlyMap<string, string>
}

export function useProjectWorkbenchDraftCommands({
  cadNodeByID,
  commandAdapterRef,
  onSelectionClear,
  projectCADDocument,
  sourceNodeIDByModelID,
}: UseProjectWorkbenchDraftCommandsOptions) {
  const { t } = useTranslation()
  const [transformDraftsByNodeID, setTransformDraftsByNodeID] = useState<Record<string, TransformDraft>>({})
  const [boxFeatureDraftsByModelID, setBoxFeatureDraftsByModelID] = useState<Record<string, BoxFeatureDraft>>({})

  const draftModelTranslationsByID = useMemo(() => {
    const translations: Record<string, CADTranslation> = {}
    for (const [nodeID, draft] of Object.entries(transformDraftsByNodeID)) {
      const translation = parseTransformDraft(draft)
      if (!translation) {
        continue
      }
      translations[nodeID] = translation
      const modelID = cadNodeByID.get(nodeID)?.model_id
      if (modelID) {
        translations[modelID] = translation
      }
    }
    return translations
  }, [cadNodeByID, transformDraftsByNodeID])

  const handleTransformSynchronized = useCallback((nodeId: string) => {
    setTransformDraftsByNodeID((currentDrafts) => {
      const nextDrafts = { ...currentDrafts }
      delete nextDrafts[nodeId]
      return nextDrafts
    })
  }, [])

  const handleCADDocumentNodeDeleted = useCallback(
    (nodeId: string) => {
      const deletedNode = cadNodeByID.get(nodeId)
      setTransformDraftsByNodeID((currentDrafts) => {
        const nextDrafts = { ...currentDrafts }
        delete nextDrafts[nodeId]
        return nextDrafts
      })
      setBoxFeatureDraftsByModelID((currentDrafts) => {
        const modelIDs = [deletedNode?.model_id, deletedNode?.source_model_id].filter((modelID): modelID is string => Boolean(modelID))
        if (modelIDs.length === 0) {
          return currentDrafts
        }
        const nextDrafts = { ...currentDrafts }
        modelIDs.forEach((modelID) => delete nextDrafts[modelID])
        return nextDrafts
      })
      onSelectionClear()
    },
    [cadNodeByID, onSelectionClear],
  )

  const latestBoxFeatureDraftForModel = useCallback(
    (modelID: string) => {
      const latestBoxOperation = [...(projectCADDocument?.operations ?? [])]
        .reverse()
        .find((operation) => operation.model_id === modelID && operation.type === 'box-union' && operation.box)
      return latestBoxOperation?.box ? boxFeatureDraftFromCADBoxFeature(latestBoxOperation.box) : defaultBoxFeatureDraft()
    },
    [projectCADDocument],
  )

  const updateTransformDraftFromTranslation = useCallback(
    (modelID: string, translation: CADTranslation, selectedNodeID?: string) => {
      const commandAdapter = commandAdapterRef.current
      const nodeID = selectedNodeID ?? sourceNodeIDByModelID.get(modelID) ?? `node_${modelID}`
      const nextDraft = transformDraftFromTranslation(translation)
      setTransformDraftsByNodeID((currentDrafts) => ({ ...currentDrafts, [nodeID]: nextDraft }))
      commandAdapter?.setTransformValidationError(nodeID, '')
      commandAdapter?.scheduleTransformAutosave(nodeID, translation)
    },
    [commandAdapterRef, sourceNodeIDByModelID],
  )

  const updateTransformDraftField = useCallback(
    (nodeID: string, axis: keyof CADTranslation, value: string) => {
      const commandAdapter = commandAdapterRef.current
      const currentDraft = transformDraftsByNodeID[nodeID] ?? transformDraftFromTranslation(translationFromCADTransform(cadNodeByID.get(nodeID)?.transform))
      const nextDraft = { ...currentDraft, [axis]: value }
      setTransformDraftsByNodeID((currentDrafts) => ({ ...currentDrafts, [nodeID]: nextDraft }))
      const translation = parseTransformDraft(nextDraft)
      if (!translation) {
        commandAdapter?.cancelTransformAutosave(nodeID)
        commandAdapter?.setTransformValidationError(nodeID, t('project.errors.invalidTransform'))
        return
      }
      const savedTranslation = translationFromCADTransform(cadNodeByID.get(nodeID)?.transform)
      if (translationsEqual(translation, savedTranslation)) {
        commandAdapter?.cancelTransformAutosave(nodeID)
        commandAdapter?.setTransformValidationError(nodeID, '')
        return
      }
      commandAdapter?.setTransformValidationError(nodeID, '')
      commandAdapter?.scheduleTransformAutosave(nodeID, translation)
    },
    [cadNodeByID, commandAdapterRef, t, transformDraftsByNodeID],
  )

  const updateBoxFeatureDraft = useCallback(
    (modelID: string, field: keyof BoxFeatureDraft, value: string) => {
      setBoxFeatureDraftsByModelID((currentDrafts) => {
        const currentDraft = currentDrafts[modelID] ?? latestBoxFeatureDraftForModel(modelID)
        return {
          ...currentDrafts,
          [modelID]: {
            ...currentDraft,
            [field]: value,
          },
        }
      })
    },
    [latestBoxFeatureDraftForModel],
  )

  const addBoxFeatureDraft = useCallback(
    (modelID: string) => {
      const commandAdapter = commandAdapterRef.current
      const draft = boxFeatureDraftsByModelID[modelID] ?? latestBoxFeatureDraftForModel(modelID)
      const box = parseBoxFeatureDraft(draft)
      if (!box) {
        commandAdapter?.setBoxValidationError(modelID, t('project.errors.invalidBox'))
        return
      }
      commandAdapter?.addBoxUnion(modelID, box)
    },
    [boxFeatureDraftsByModelID, commandAdapterRef, latestBoxFeatureDraftForModel, t],
  )

  return {
    addBoxFeatureDraft,
    boxFeatureDraftsByModelID,
    draftModelTranslationsByID,
    handleCADDocumentNodeDeleted,
    handleTransformSynchronized,
    latestBoxFeatureDraftForModel,
    transformDraftsByNodeID,
    updateBoxFeatureDraft,
    updateTransformDraftField,
    updateTransformDraftFromTranslation,
  }
}

function translationsEqual(left: CADTranslation | undefined, right: CADTranslation | undefined) {
  return !!left && !!right && left.x === right.x && left.y === right.y && left.z === right.z
}
