import { useEffect, useRef } from 'react'

import type { CADTranslation } from './cad-document-transforms'

type UseModelPreviewSelectionOptions = {
  draftModelTranslations?: Record<string, CADTranslation>
  modelTranslations?: Record<string, CADTranslation>
  onClearSelection?: () => void
  onModelTranslationChange?: (modelId: string, translation: CADTranslation, nodeId?: string, occurrenceId?: string) => void
	onSelectModel?: (modelId: string, nodeId?: string, occurrenceId?: string) => void
  selectedModelId?: string
  selectedNodeId?: string
	selectedOccurrenceId?: string
  transformControlsLocked?: boolean
  syncSelection?: () => void
  syncTransforms?: () => void
  syncVisibility?: () => void
  visibleModelIds?: readonly string[]
}

const noop = () => undefined

const translationSignature = (translations: Record<string, CADTranslation> | undefined) =>
  Object.entries(translations ?? {})
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([modelId, translation]) => `${modelId}:${translation.x},${translation.y},${translation.z}`)
    .join('|')

export function useModelPreviewSelection({
  draftModelTranslations,
  modelTranslations,
  onClearSelection,
  onModelTranslationChange,
  onSelectModel,
  selectedModelId,
  selectedNodeId,
	selectedOccurrenceId,
  transformControlsLocked = false,
  syncSelection = noop,
  syncTransforms = noop,
  syncVisibility = noop,
  visibleModelIds,
}: UseModelPreviewSelectionOptions) {
  const draftModelTranslationsRef = useRef(draftModelTranslations)
  const modelTranslationsRef = useRef(modelTranslations)
  const onClearSelectionRef = useRef(onClearSelection)
  const onModelTranslationChangeRef = useRef(onModelTranslationChange)
  const onSelectModelRef = useRef(onSelectModel)
  const selectedModelIdRef = useRef(selectedModelId)
  const selectedNodeIdRef = useRef(selectedNodeId)
	const selectedOccurrenceIdRef = useRef(selectedOccurrenceId)
  const transformControlsLockedRef = useRef(transformControlsLocked)
  const visibleModelIdsRef = useRef(visibleModelIds)
  const syncSelectionRef = useRef(syncSelection)
  const syncTransformsRef = useRef(syncTransforms)
  const syncVisibilityRef = useRef(syncVisibility)
  const draftTranslationSignature = translationSignature(draftModelTranslations)
  const modelTranslationSignature = translationSignature(modelTranslations)
  const visibleModelIdSignature = visibleModelIds?.join('|') ?? '*'

  useEffect(() => {
    onClearSelectionRef.current = onClearSelection
    onModelTranslationChangeRef.current = onModelTranslationChange
    onSelectModelRef.current = onSelectModel
    selectedModelIdRef.current = selectedModelId
    selectedNodeIdRef.current = selectedNodeId
		selectedOccurrenceIdRef.current = selectedOccurrenceId
    transformControlsLockedRef.current = transformControlsLocked
    syncSelectionRef.current()
	}, [onClearSelection, onModelTranslationChange, onSelectModel, selectedModelId, selectedNodeId, selectedOccurrenceId, transformControlsLocked])

  useEffect(() => {
    visibleModelIdsRef.current = visibleModelIds
    syncVisibilityRef.current()
    // The signature keeps this effect primitive-stable while callers may pass fresh arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleModelIdSignature])

  useEffect(() => {
    draftModelTranslationsRef.current = draftModelTranslations
    modelTranslationsRef.current = modelTranslations
    syncTransformsRef.current()
    // The signatures keep this effect primitive-stable while callers may pass fresh objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftTranslationSignature, modelTranslationSignature])

  return {
    draftModelTranslationsRef,
    modelTranslationsRef,
    onClearSelectionRef,
    onModelTranslationChangeRef,
    onSelectModelRef,
    selectedModelIdRef,
    selectedNodeIdRef,
		selectedOccurrenceIdRef,
    transformControlsLockedRef,
    syncSelectionRef,
    syncTransformsRef,
    syncVisibilityRef,
    visibleModelIdsRef,
  }
}
