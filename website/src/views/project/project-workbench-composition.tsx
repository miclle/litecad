import type { RefObject } from 'react'

import { ProjectAssistantPanel } from './project-assistant-panel'
import { ProjectCanvas } from './project-canvas'
import { ProjectTopbar } from './project-topbar'
import { ProjectWorkbenchLayout } from './project-workbench-layout'
import { ProjectWorkbenchSidebar } from './project-workbench-sidebar'
import { cadUnitLabel } from './cad-unit-label'
import { initialViewOrientation } from './view-orientation'
import type { CADHistoryEntry, Project } from 'src/types/project'
import type { StepExportTarget } from './project-step-export'
import type { useCADDocumentCommands } from './use-cad-document-commands'
import type { useProjectAssistantController } from './use-project-assistant-controller'
import type { useProjectModelUploadController } from './use-project-model-upload-controller'
import type { useProjectInspectionRecordsController } from './use-project-inspection-records-controller'
import type { useProjectSectionArtifactsController } from './use-project-section-artifacts-controller'
import type { useProjectStepExportController } from './use-project-step-export-controller'
import type { useProjectThumbnailSnapshotController } from './use-project-thumbnail-snapshot-controller'
import type { useProjectWorkbenchDraftCommands } from './use-project-workbench-draft-commands'
import type { useProjectWorkbenchInspectorState } from './use-project-workbench-inspector-state'
import type { useProjectWorkbenchModelState } from './use-project-workbench-model-state'
import type { useProjectWorkbenchParametricModelCommands } from './use-project-workbench-parametric-model-commands'
import type { useProjectWorkbenchShellState } from './use-project-workbench-shell-state'
import type { useProjectWorkbenchViewControls } from './use-project-workbench-view-controls'
import type { useProjectWorkbenchVisibilityState } from './use-project-workbench-visibility-state'

export type ProjectCADHistoryState = {
  entries: CADHistoryEntry[]
  fetchNextPage: () => void
  hasNextPage: boolean
  isError: boolean
  isFetchingNextPage: boolean
  isPending: boolean
}

export type ProjectWorkbenchCompositionProps = {
  cadDocumentCommands: ReturnType<typeof useCADDocumentCommands>
  draftCommands: ReturnType<typeof useProjectWorkbenchDraftCommands>
  fileInputRef: RefObject<HTMLInputElement | null>
  inspectorState: ReturnType<typeof useProjectWorkbenchInspectorState>
  modelState: ReturnType<typeof useProjectWorkbenchModelState>
  parametricModelCommands: ReturnType<typeof useProjectWorkbenchParametricModelCommands>
  project: Project
  projectAssistant: ReturnType<typeof useProjectAssistantController>
  projectCADHistory: ProjectCADHistoryState
  projectModelUpload: ReturnType<typeof useProjectModelUploadController>
  projectInspectionRecords: ReturnType<typeof useProjectInspectionRecordsController>
  projectSectionArtifacts: ReturnType<typeof useProjectSectionArtifactsController>
  projectStepExport: ReturnType<typeof useProjectStepExportController>
  projectThumbnailSnapshot: ReturnType<typeof useProjectThumbnailSnapshotController>
  shellState: ReturnType<typeof useProjectWorkbenchShellState>
  stepExportTargets: StepExportTarget[]
  viewControls: ReturnType<typeof useProjectWorkbenchViewControls>
  visibilityState: ReturnType<typeof useProjectWorkbenchVisibilityState>
}

export function ProjectWorkbenchComposition({
  cadDocumentCommands,
  draftCommands,
  fileInputRef,
  inspectorState,
  modelState,
  parametricModelCommands,
  project,
  projectAssistant,
  projectCADHistory,
  projectModelUpload,
  projectInspectionRecords,
  projectSectionArtifacts,
  projectStepExport,
  projectThumbnailSnapshot,
  shellState,
  stepExportTargets,
  viewControls,
  visibilityState,
}: ProjectWorkbenchCompositionProps) {
  const {
    activeCADTool,
    effectiveSelectedDocumentNodeID,
    effectiveSelectedModelID,
		effectiveSelectedOccurrenceID,
    clearSelection,
    selectModel,
    selectedArtifact: selectedParametricArtifact,
    selectedDocumentNode,
    selectedSourceModel,
    setActiveCADTool,
  } = modelState.projectSelection

  return (
    <ProjectWorkbenchLayout
      assistantPanel={
        <ProjectAssistantPanel
          activeConversationId={projectAssistant.activeConversationID}
          activeModelName={projectAssistant.activeModelName}
          conversations={projectAssistant.conversations}
          draft={projectAssistant.draft}
          isPending={projectAssistant.isPending}
          maxWidth={shellState.aiChatPanelMaxWidth}
          messages={projectAssistant.messages}
          onClose={shellState.closeAiChat}
          onCreateConversation={projectAssistant.createConversation}
          onDraftChange={projectAssistant.setDraft}
          onGenerateParametric={projectAssistant.generateParametricArtifact}
          onResizePointerDown={shellState.startAiChatPanelResize}
          onRetryParametric={projectAssistant.retryParametricGeneration}
          onSelectConversation={projectAssistant.selectConversation}
          onSubmit={projectAssistant.submitMessage}
          open={shellState.isAiChatOpen}
          parametricProgress={projectAssistant.parametricProgress}
          parametricRunError={projectAssistant.parametricRunError}
          pendingKind={projectAssistant.pendingKind}
          retryParametricPrompt={projectAssistant.retryParametricPrompt}
          sourceCount={modelState.projectModels.length}
          width={shellState.aiChatPanelWidth}
        />
      }
      canvas={
        <ProjectCanvas
          activeCADTool={activeCADTool}
          animateViewCubeOrientation={viewControls.animateViewCubeOrientation}
          canAnalyzeTopology={projectInspectionRecords.canAnalyzeTopology}
          canGenerateSectionGeometry={projectSectionArtifacts.visibleSectionTargetCount > 0}
          canvasRightOffset={shellState.canvasRightOffset}
          canvasStatusBody={modelState.canvasStatusBody}
          canvasStatusLabel={modelState.canvasStatusLabel}
          canvasStatusLeftOffset={shellState.canvasStatusLeftOffset}
          deferResize={shellState.isAiChatTransitioning}
          draftModelTranslations={draftCommands.draftModelTranslationsByID}
          getSectionArtifactState={projectSectionArtifacts.getSectionArtifactState}
          isSelectedModelBoxFeatureUpdating={inspectorState.isSelectedModelBoxFeatureUpdating}
          modelTranslations={modelState.modelTranslationsByID}
          onApplyBoxFeatureDraft={draftCommands.addBoxFeatureDraft}
          onAnalyzeTopology={projectInspectionRecords.analyzeTopology}
          onClearSelection={() => {
            clearSelection()
            cadDocumentCommands.clearDeleteError()
          }}
          onCloseCADTool={() => setActiveCADTool('inspect')}
          onFlipOrientation={viewControls.flipCanvasOrientation}
          onModelTranslationChange={draftCommands.updateTransformDraftFromTranslation}
          onResetIsometric={() => viewControls.applyCanvasOrientation(initialViewOrientation)}
          onDeleteInspectionRecord={projectInspectionRecords.deleteInspectionRecord}
          onDeleteSectionArtifact={projectSectionArtifacts.deleteSectionArtifact}
          onDownloadSectionArtifact={projectSectionArtifacts.downloadSectionArtifact}
          onGenerateSectionArtifact={projectSectionArtifacts.generateSectionArtifact}
          onRegenerateSectionArtifact={projectSectionArtifacts.regenerateSectionArtifact}
          onRestoreSectionArtifact={projectSectionArtifacts.restoreSectionArtifact}
          onSaveMeasurementRecord={projectInspectionRecords.saveMeasurementRecord}
			onSelectModel={(modelID, nodeID, occurrenceID) => {
				if (occurrenceID) {
					selectModel(modelID, nodeID, occurrenceID)
				} else {
					selectModel(modelID, nodeID)
				}
            cadDocumentCommands.clearDeleteError()
          }}
          onSetOrientation={viewControls.applyCanvasOrientation}
          onSnapshotCapture={projectThumbnailSnapshot.onSnapshotCapture}
          onStepOrientation={viewControls.stepCanvasOrientation}
          onToggleFuseBoxTool={() => setActiveCADTool((currentTool) => (currentTool === 'fuse-box' ? 'inspect' : 'fuse-box'))}
          onUpdateBoxFeatureDraft={draftCommands.updateBoxFeatureDraft}
          previewAssets={modelState.previewAssets}
          inspectionRecords={projectInspectionRecords.inspectionRecords}
          inspectionRecordError={projectInspectionRecords.inspectionRecordError}
          isInspectionRecordsLoading={projectInspectionRecords.isInspectionRecordsLoading}
          isInspectionRecordMutationPending={projectInspectionRecords.isInspectionRecordMutationPending}
          isSectionArtifactMutationPending={projectSectionArtifacts.isSectionArtifactMutationPending}
          isSectionArtifactsLoading={projectSectionArtifacts.isSectionArtifactsLoading}
          measurementUnitLabel={cadUnitLabel(projectInspectionRecords.previewMeasurementUnit)}
          projectCADDocument={modelState.projectCADDocument}
          projectId={project.id}
          selectedDocumentNode={selectedDocumentNode}
          selectedModelBoxFeatureDraft={inspectorState.selectedModelBoxFeatureDraft}
          selectedModelBoxFeatureError={inspectorState.selectedModelBoxFeatureError}
          selectedModelDisplayName={inspectorState.selectedModelDisplayName}
          selectedModelId={effectiveSelectedModelID}
					selectedOccurrenceId={effectiveSelectedOccurrenceID}
          selectedModelSupportsFuseBox={inspectorState.selectedModelSupportsFuseBox}
          selectedNodeId={effectiveSelectedDocumentNodeID}
          selectedSourceModel={selectedSourceModel}
          sectionArtifactError={projectSectionArtifacts.sectionArtifactError}
          sectionArtifacts={projectSectionArtifacts.sectionArtifacts}
          shouldShowCanvasStatus={modelState.shouldShowCanvasStatus}
          unitLabel={inspectorState.documentUnitLabel}
          viewOrientation={viewControls.viewOrientation}
          visibleModelIds={modelState.visibleModelIds}
        />
      }
      isAiChatPanelResizing={shellState.isAiChatPanelResizing}
      leftPanel={
        <ProjectWorkbenchSidebar
          assemblyConstraints={modelState.projectCADDocument?.assembly?.constraints ?? []}
          assemblyGroups={modelState.projectCADDocument?.assembly?.groups ?? []}
          assemblyOccurrences={modelState.projectCADDocument?.assembly?.occurrences ?? []}
          assemblySubassemblies={modelState.projectCADDocument?.assembly?.subassemblies ?? []}
          documentDetails={inspectorState.documentDetails}
          hiddenModelIds={visibilityState.hiddenModelIDs}
          inspectorSelection={inspectorState.inspectorSelection}
          generatedArtifactRevisionTargetModelID={projectAssistant.generatedArtifactRevisionTargetModelID}
          isLeftPanelCollapsed={shellState.isLeftPanelCollapsed}
          isModelTreeLoading={modelState.projectModelsQuery.isLoading}
          isUploading={projectModelUpload.isUploading}
          isFeatureGraphSaving={parametricModelCommands.isSavingFeatureGraph}
					isAssemblyConstraintMutationPending={cadDocumentCommands.isAssemblyConstraintMutationPending}
					isOccurrenceMutationPending={cadDocumentCommands.isOccurrenceMutationPending}
          isSubassemblyMutationPending={cadDocumentCommands.isSubassemblyMutationPending}
          leftPanelWidth={shellState.leftPanelWidth}
          modelCount={modelState.projectModels.length}
          onCollapseChange={shellState.setIsLeftPanelCollapsed}
					onCreateAssemblyGroup={cadDocumentCommands.createAssemblyGroup}
					onDeleteAssemblyConstraint={cadDocumentCommands.deleteAssemblyConstraint}
					onDeleteAssemblyGroup={cadDocumentCommands.deleteAssemblyGroup}
					onDeleteOccurrence={(occurrenceId) => {
						cadDocumentCommands.deleteOccurrence(occurrenceId)
						clearSelection()
					}}
					onDuplicateOccurrence={cadDocumentCommands.duplicateOccurrence}
					onMoveOccurrence={cadDocumentCommands.moveOccurrence}
					onCaptureSubassembly={cadDocumentCommands.captureSubassembly}
					onInstantiateSubassembly={cadDocumentCommands.instantiateSubassembly}
			onModelSelect={(modelId, nodeId, occurrenceId) => {
				if (occurrenceId) {
					selectModel(modelId, nodeId, occurrenceId)
				} else {
					selectModel(modelId, nodeId)
				}
            cadDocumentCommands.clearDeleteError()
          }}
          onParameterValuesChange={modelState.parametricModels.updatePreviewParameters}
          onApplyGeneratedArtifactToModel={(modelID, artifact, parameterValues) =>
            parametricModelCommands.applyGeneratedArtifactToModel({ modelID, artifact, parameterValues })
          }
          onResizePointerDown={shellState.startLeftPanelResize}
          onSaveGeneratedArtifactAsModel={(artifact, parameterValues) =>
            parametricModelCommands.saveGeneratedArtifactAsModel({ artifact, parameterValues })
          }
          onSaveFeatureGraph={(modelID, sourceCode) =>
            parametricModelCommands.saveFeatureGraph({ modelID, sourceCode })
          }
          onSaveModelParameters={(modelID, parameterValues) =>
            parametricModelCommands.saveModelParameters({ modelID, parameterValues })
          }
          onRestoreModelRevision={(modelID, revisionID) =>
            parametricModelCommands.restoreModelRevision({ modelID, revisionID })
          }
          onToggleModelVisibility={visibilityState.toggleModelVisibility}
          onUpdateAssemblyGroup={cadDocumentCommands.updateAssemblyGroup}
					onUpdateOccurrence={cadDocumentCommands.updateOccurrence}
					constraintError={cadDocumentCommands.constraintError}
					occurrenceError={cadDocumentCommands.occurrenceError}
					subassemblyError={cadDocumentCommands.subassemblyError}
          onTransformChange={draftCommands.updateTransformDraftField}
          previewAssetModelIds={modelState.previewAssetModelIDs}
          projectModelTree={modelState.projectModelTree}
          selectedGeneratedArtifact={selectedParametricArtifact}
          selectedNodeId={effectiveSelectedDocumentNodeID}
					selectedOccurrenceId={effectiveSelectedOccurrenceID}
          selectedSavedArtifact={modelState.parametricModels.selectedSavedArtifact}
          selectedSavedModelRevisionID={selectedSourceModel?.current_revision_id}
          selectedSavedModelRevisionSequence={selectedSourceModel?.revision_sequence}
          selectedModelRevisions={modelState.parametricModels.selectedModelRevisions}
          isRevisionRestorePending={parametricModelCommands.isRestoringModelRevision}
          unitLabel={inspectorState.documentUnitLabel}
          uploadError={projectModelUpload.uploadError}
        />
      }
      topbar={
        <ProjectTopbar
          canRedo={Boolean(modelState.projectCADDocument?.history.can_redo)}
          canUndo={Boolean(modelState.projectCADDocument?.history.can_undo)}
          documentDetails={inspectorState.documentDetails}
          fileInputRef={fileInputRef}
          hasNextHistoryPage={projectCADHistory.hasNextPage}
          historyEntries={projectCADHistory.entries}
          historyError={cadDocumentCommands.historyError}
          isAiChatOpen={shellState.isAiChatOpen}
          isHistoryFetchingNextPage={projectCADHistory.isFetchingNextPage}
          isHistoryLoading={projectCADHistory.isPending}
          isHistoryLoadError={projectCADHistory.isError}
          isHistoryMutationPending={cadDocumentCommands.isPending}
          isHistoryOpen={shellState.isHistoryOpen}
          isProjectInfoOpen={shellState.isProjectInfoOpen}
          isStepExportOpen={shellState.isStepExportOpen}
          isUploading={projectModelUpload.isUploading}
          exportArtifacts={projectStepExport.exportArtifacts}
          isExportHistoryError={projectStepExport.isExportHistoryError}
          isExportHistoryLoading={projectStepExport.isExportHistoryLoading}
          onDownloadExportArtifact={projectStepExport.downloadExportArtifact}
          onFetchNextHistoryPage={projectCADHistory.fetchNextPage}
          onHistoryAction={cadDocumentCommands.changeHistory}
          onHistoryOpenChange={shellState.setIsHistoryOpen}
          onModelFileChange={projectModelUpload.handleModelFileChange}
          onProjectInfoOpenChange={shellState.setIsProjectInfoOpen}
          onStepExport={projectStepExport.exportSelection}
          onStepExportOpenChange={shellState.setIsStepExportOpen}
          onStepExportSelectAll={projectStepExport.selectAllTargets}
          onStepExportToggleTarget={projectStepExport.toggleTarget}
          onToggleAiChat={shellState.toggleAiChat}
          previewSummary={modelState.previewSummary}
          project={project}
          projectDescription={inspectorState.projectDescription}
          selectedStepExportTargetIds={projectStepExport.selectedTargetIDs}
          stepExportDisabled={stepExportTargets.length === 0 || !modelState.projectCADDocument}
          stepExportTargets={stepExportTargets}
        />
      }
      workspaceGridStyle={shellState.workspaceGridStyle}
    />
  )
}
