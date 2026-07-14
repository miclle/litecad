import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchProjectCADHistory } from 'src/api/projects'
import type { Project } from 'src/types/project'
import type { ProjectWorkbenchCompositionProps } from './project-workbench-composition'
import {
  buildStepExportTargets,
  stepAssemblyExportFilename,
} from './project-step-export'
import { useCADDocumentCommands } from './use-cad-document-commands'
import { useProjectAssistantController } from './use-project-assistant-controller'
import { useProjectModelUploadController } from './use-project-model-upload-controller'
import { useProjectInspectionRecordsController } from './use-project-inspection-records-controller'
import { useProjectStepExportController } from './use-project-step-export-controller'
import { useProjectThumbnailSnapshotController } from './use-project-thumbnail-snapshot-controller'
import { useProjectWorkbenchDraftCommands, type ProjectWorkbenchDraftCommandAdapter } from './use-project-workbench-draft-commands'
import { useProjectWorkbenchInspectorState } from './use-project-workbench-inspector-state'
import { useProjectWorkbenchKeyboardCommands } from './use-project-workbench-keyboard-commands'
import { useProjectWorkbenchModelState } from './use-project-workbench-model-state'
import { useProjectWorkbenchParametricModelCommands } from './use-project-workbench-parametric-model-commands'
import { useProjectWorkbenchShellState } from './use-project-workbench-shell-state'
import { useProjectWorkbenchViewControls } from './use-project-workbench-view-controls'
import { useProjectWorkbenchVisibilityState } from './use-project-workbench-visibility-state'

type UseProjectWorkbenchRouteControllersOptions = {
  isProjectLoaded: boolean
  project?: Project
  projectId: string
}

export function useProjectWorkbenchRouteControllers({
  isProjectLoaded,
  project,
  projectId,
}: UseProjectWorkbenchRouteControllersOptions): Omit<ProjectWorkbenchCompositionProps, 'fileInputRef' | 'project'> {
  const { t } = useTranslation()
  const shellState = useProjectWorkbenchShellState()
  const viewControls = useProjectWorkbenchViewControls()
  const visibilityState = useProjectWorkbenchVisibilityState()
  const cadDocumentCommandAdapterRef = useRef<ProjectWorkbenchDraftCommandAdapter | null>(null)
  const projectModelUpload = useProjectModelUploadController({
    projectId,
  })
  const modelState = useProjectWorkbenchModelState({
    hiddenModelIds: visibilityState.hiddenModelIDs,
    isProjectLoaded,
    projectId,
  })
  const {
    cadNodeByID,
    latestModel,
    latestTriangleCount,
    previewAssets,
    previewSummary,
    projectCADDocument,
    projectModels,
    projectSelection,
    sourceNodeIDByModelID,
    visibleModelIds,
  } = modelState
  const projectCADHistoryQuery = useInfiniteQuery({
    queryKey: ['projects', projectId, 'cad-document', 'history'],
    queryFn: async ({ pageParam }) => (await fetchProjectCADHistory(projectId, pageParam)).data,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.next_before_sequence,
    enabled: projectId !== '' && Boolean(projectCADDocument) && shellState.isHistoryOpen,
  })
  const projectCADHistoryEntries = projectCADHistoryQuery.data?.pages.flatMap((page) => page.entries) ?? []
  const stepExportTargets = useMemo(
    () => buildStepExportTargets(projectModels, projectCADDocument),
    [projectModels, projectCADDocument],
  )
  const stepAssemblyDownloadFilename = stepAssemblyExportFilename(project?.name ?? 'assembly', projectCADDocument?.revision ?? 0)
  const projectStepExport = useProjectStepExportController({
    assemblyDownloadFilename: stepAssemblyDownloadFilename,
    projectId,
    targets: stepExportTargets,
  })
  const projectAssistant = useProjectAssistantController({
    activeModel: projectSelection.selectedSourceModel,
    enabled: projectId !== '' && shellState.isAiChatOpen,
    onArtifactSelected: projectSelection.selectArtifact,
    projectId,
  })
  const {
    effectiveSelectedDocumentNodeID,
    clearSelection,
    selectedDocumentNode,
    selectedSourceModel,
  } = projectSelection
  const draftCommands = useProjectWorkbenchDraftCommands({
    cadNodeByID,
		cadOccurrenceByID: modelState.cadOccurrenceByID,
    commandAdapterRef: cadDocumentCommandAdapterRef,
    onSelectionClear: clearSelection,
    projectCADDocument,
    sourceNodeIDByModelID,
  })
  const cadDocumentCommands = useCADDocumentCommands({
    projectId,
    onConflict: shellState.handleCADDocumentConflict,
    onNodeDeleted: draftCommands.handleCADDocumentNodeDeleted,
    onTransformSynchronized: draftCommands.handleTransformSynchronized,
  })
  const {
    changeHistory,
    isPending: isCADDocumentCommandPending,
  } = cadDocumentCommands
  const keyboardDeleteNode = effectiveSelectedDocumentNodeID ? cadNodeByID.get(effectiveSelectedDocumentNodeID) : undefined
  const parametricModelCommands = useProjectWorkbenchParametricModelCommands({
    onArtifactSaveError: () => {
      projectAssistant.setParametricRunError(t('project.parametric.saveFailed'))
    },
    onModelSelected: projectSelection.selectModel,
    onConflict: shellState.handleCADDocumentConflict,
    projectId,
  })
  const projectThumbnailSnapshot = useProjectThumbnailSnapshotController({
    previewAssets,
    projectId,
    revision: projectCADDocument?.revision ?? 0,
    visibleModelIds,
  })
  const projectInspectionRecords = useProjectInspectionRecordsController({
    cadDocumentRevision: projectCADDocument?.revision ?? 0,
    projectId,
    unit: projectCADDocument?.unit ?? 'unit',
    visibleModelIds,
  })

  useEffect(() => {
    cadDocumentCommandAdapterRef.current = cadDocumentCommands
    return () => {
      if (cadDocumentCommandAdapterRef.current === cadDocumentCommands) {
        cadDocumentCommandAdapterRef.current = null
      }
    }
  }, [cadDocumentCommands])

  useProjectWorkbenchKeyboardCommands({
    changeHistory,
    clearDeleteError: cadDocumentCommands.clearDeleteError,
    deleteNode: cadDocumentCommands.deleteNode,
		deleteOccurrence: cadDocumentCommands.deleteOccurrence,
    isCADDocumentCommandPending,
    keyboardDeleteNode,
    projectCADDocument,
		selectedOccurrence: projectSelection.selectedOccurrence,
		selectedModelOccurrenceCount: projectCADDocument?.assembly?.occurrences.filter(
			(occurrence) => occurrence.model_id === projectSelection.selectedOccurrence?.model_id,
		).length ?? 0,
  })

  const inspectorState = useProjectWorkbenchInspectorState({
    boxErrorsByModelId: cadDocumentCommands.boxErrorsByModelId,
    boxFeatureDraftsByModelId: draftCommands.boxFeatureDraftsByModelID,
    deleteError: cadDocumentCommands.deleteError,
    getBoxFeatureDraft: draftCommands.latestBoxFeatureDraftForModel,
    isBoxUnionPendingFor: cadDocumentCommands.isBoxUnionPendingFor,
    latestModel,
    latestTriangleCount,
    previewSummary,
    project,
    projectCADDocument,
    selectedDocumentNode,
		selectedOccurrence: projectSelection.selectedOccurrence,
    selectedSourceModel,
    stepExportErrorByModelId: projectStepExport.errorByModelID,
    stepExportStatusByModelId: projectStepExport.statusByModelID,
    transformDraftsByNodeId: draftCommands.transformDraftsByNodeID,
    transformErrorsByNodeId: cadDocumentCommands.transformErrorsByNodeId,
  })

  return {
    cadDocumentCommands,
    draftCommands,
    inspectorState,
    modelState,
    parametricModelCommands,
    projectAssistant,
    projectCADHistory: {
      entries: projectCADHistoryEntries,
      fetchNextPage: () => projectCADHistoryQuery.fetchNextPage(),
      hasNextPage: Boolean(projectCADHistoryQuery.hasNextPage),
      isError: projectCADHistoryQuery.isError,
      isFetchingNextPage: projectCADHistoryQuery.isFetchingNextPage,
      isPending: projectCADHistoryQuery.isPending,
    },
    projectModelUpload,
    projectInspectionRecords,
    projectStepExport,
    projectThumbnailSnapshot,
    shellState,
    stepExportTargets,
    viewControls,
    visibilityState,
  }
}
