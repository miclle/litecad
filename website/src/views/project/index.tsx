import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import {
  ArrowLeft,
  FileText,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import {
  fetchProject,
  fetchProjectCADHistory,
} from 'src/api/projects'
import { ProjectWorkbenchComposition } from './project-workbench-composition'
import {
  buildStepExportTargets,
  stepAssemblyExportFilename,
} from './project-step-export'
import { useCADDocumentCommands } from './use-cad-document-commands'
import { useProjectAssistantController } from './use-project-assistant-controller'
import { useProjectModelUploadController } from './use-project-model-upload-controller'
import { useProjectStepExportController } from './use-project-step-export-controller'
import { useProjectThumbnailSnapshotController } from './use-project-thumbnail-snapshot-controller'
import { useProjectWorkbenchInspectorState } from './use-project-workbench-inspector-state'
import { useProjectWorkbenchDraftCommands, type ProjectWorkbenchDraftCommandAdapter } from './use-project-workbench-draft-commands'
import { useProjectWorkbenchKeyboardCommands } from './use-project-workbench-keyboard-commands'
import { useProjectWorkbenchModelState } from './use-project-workbench-model-state'
import { useProjectWorkbenchParametricModelCommands } from './use-project-workbench-parametric-model-commands'
import { useProjectWorkbenchShellState } from './use-project-workbench-shell-state'
import { useProjectWorkbenchViewControls } from './use-project-workbench-view-controls'
import { useProjectWorkbenchVisibilityState } from './use-project-workbench-visibility-state'

function ProjectView() {
  const { projectId = '' } = useParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const shellState = useProjectWorkbenchShellState()
  const viewControls = useProjectWorkbenchViewControls()
  const visibilityState = useProjectWorkbenchVisibilityState()
  const cadDocumentCommandAdapterRef = useRef<ProjectWorkbenchDraftCommandAdapter | null>(null)
  const projectQuery = useQuery({
    queryKey: ['projects', projectId],
    queryFn: async () => (await fetchProject(projectId)).data.project,
    enabled: projectId !== '',
  })
  const projectModelUpload = useProjectModelUploadController({
    projectId,
  })
  const project = projectQuery.data
  const projectWorkbenchModelState = useProjectWorkbenchModelState({
    hiddenModelIds: visibilityState.hiddenModelIDs,
    isProjectLoaded: projectQuery.isSuccess,
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
  } = projectWorkbenchModelState
  const projectCADHistoryQuery = useInfiniteQuery({
    queryKey: ['projects', projectId, 'cad-document', 'history'],
    queryFn: async ({ pageParam }) => (await fetchProjectCADHistory(projectId, pageParam)).data,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.next_before_sequence,
    enabled: projectId !== '' && Boolean(projectCADDocument) && shellState.isHistoryOpen,
  })
  const projectCADHistory = projectCADHistoryQuery.data?.pages.flatMap((page) => page.entries) ?? []
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
  const projectDraftCommands = useProjectWorkbenchDraftCommands({
    cadNodeByID,
    commandAdapterRef: cadDocumentCommandAdapterRef,
    onSelectionClear: clearSelection,
    projectCADDocument,
    sourceNodeIDByModelID,
  })
  const cadDocumentCommands = useCADDocumentCommands({
    projectId,
    onConflict: shellState.handleCADDocumentConflict,
    onNodeDeleted: projectDraftCommands.handleCADDocumentNodeDeleted,
    onTransformSynchronized: projectDraftCommands.handleTransformSynchronized,
  })
  const {
    changeHistory,
    isPending: isCADDocumentCommandPending,
  } = cadDocumentCommands
  const keyboardDeleteNode = effectiveSelectedDocumentNodeID ? cadNodeByID.get(effectiveSelectedDocumentNodeID) : undefined
  const projectParametricModelCommands = useProjectWorkbenchParametricModelCommands({
    onArtifactSaveError: () => {
      projectAssistant.setParametricRunError('Generated source could not be added to the canvas. Try generating it again.')
    },
    onModelSelected: projectSelection.selectModel,
    projectId,
  })
  const projectThumbnailSnapshot = useProjectThumbnailSnapshotController({
    previewAssets,
    projectId,
    revision: projectCADDocument?.revision ?? 0,
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
    isCADDocumentCommandPending,
    keyboardDeleteNode,
    projectCADDocument,
  })

  const projectInspectorState = useProjectWorkbenchInspectorState({
    boxErrorsByModelId: cadDocumentCommands.boxErrorsByModelId,
    boxFeatureDraftsByModelId: projectDraftCommands.boxFeatureDraftsByModelID,
    deleteError: cadDocumentCommands.deleteError,
    getBoxFeatureDraft: projectDraftCommands.latestBoxFeatureDraftForModel,
    isBoxUnionPendingFor: cadDocumentCommands.isBoxUnionPendingFor,
    latestModel,
    latestTriangleCount,
    previewSummary,
    project,
    projectCADDocument,
    selectedDocumentNode,
    selectedSourceModel,
    stepExportErrorByModelId: projectStepExport.errorByModelID,
    stepExportStatusByModelId: projectStepExport.statusByModelID,
    transformDraftsByNodeId: projectDraftCommands.transformDraftsByNodeID,
    transformErrorsByNodeId: cadDocumentCommands.transformErrorsByNodeId,
  })

  if (projectQuery.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc] text-[#0f172a]">
        <div className="font-mono text-xs uppercase tracking-wide text-[#64748b]">Opening project</div>
      </div>
    )
  }

  if (projectQuery.isError || !project) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc] px-5 text-center text-[#0f172a]">
        <div>
          <FileText className="mx-auto size-8 text-[#475569]" />
          <h1 className="mt-4 text-2xl font-semibold">Project unavailable</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#64748b]">
            This project could not be loaded. It may have been removed or belongs to another account.
          </p>
          <Link
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0f172a] px-4 text-sm font-semibold text-[#f8fafc] no-underline transition hover:bg-[#1f2937]"
            to="/projects"
          >
            <ArrowLeft className="size-4" />
            All projects
          </Link>
        </div>
      </div>
    )
  }
  return (
    <ProjectWorkbenchComposition
      cadDocumentCommands={cadDocumentCommands}
      draftCommands={projectDraftCommands}
      fileInputRef={fileInputRef}
      inspectorState={projectInspectorState}
      modelState={projectWorkbenchModelState}
      parametricModelCommands={projectParametricModelCommands}
      project={project}
      projectAssistant={projectAssistant}
      projectCADHistory={{
        entries: projectCADHistory,
        fetchNextPage: () => projectCADHistoryQuery.fetchNextPage(),
        hasNextPage: Boolean(projectCADHistoryQuery.hasNextPage),
        isError: projectCADHistoryQuery.isError,
        isFetchingNextPage: projectCADHistoryQuery.isFetchingNextPage,
        isPending: projectCADHistoryQuery.isPending,
      }}
      projectModelUpload={projectModelUpload}
      projectStepExport={projectStepExport}
      projectThumbnailSnapshot={projectThumbnailSnapshot}
      shellState={shellState}
      stepExportTargets={stepExportTargets}
      viewControls={viewControls}
      visibilityState={visibilityState}
    />
  )
}

export default ProjectView
