import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { Box, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { OpenSCADParameterValue } from 'src/cad/openscad-protocol'
import type {
  CADAssemblyGroup,
  CADAssemblyConstraintRecord,
  CADAssemblyOccurrence,
  CADSubassemblyDefinitionRevision,
  CaptureCADSubassemblyPayload,
  InstantiateCADSubassemblyPayload,
  ProjectParametricArtifact,
  UpdateCADAssemblyGroupPayload,
  UpdateCADAssemblyOccurrencePayload,
} from 'src/types/project'
import type { CADTranslation } from './cad-document-transforms'
import { ParametricArtifactEditor } from './parametric-artifact-editor'
import { ProjectInspector, type InspectorDetail, type ProjectInspectorSelection } from './project-inspector'
import { ProjectModelTree } from './project-model-tree'
import { ProjectAssemblyConstraints } from './project-assembly-constraints'
import { ProjectSubassemblies } from './project-subassemblies'
import type { ProjectModelTreeGroup } from './project-preview-assets'

type ProjectWorkbenchSidebarProps = {
  assemblyGroups?: CADAssemblyGroup[]
  assemblyConstraints?: CADAssemblyConstraintRecord[]
  assemblyOccurrences?: CADAssemblyOccurrence[]
  assemblySubassemblies?: CADSubassemblyDefinitionRevision[]
  documentDetails: InspectorDetail[]
  hiddenModelIds: ReadonlySet<string>
  inspectorSelection?: ProjectInspectorSelection
  isLeftPanelCollapsed: boolean
  isModelTreeLoading: boolean
  isUploading: boolean
  generatedArtifactRevisionTargetModelID?: string
  isOccurrenceMutationPending?: boolean
  isSubassemblyMutationPending?: boolean
  leftPanelWidth: number
  modelCount: number
  onCollapseChange: (isCollapsed: boolean) => void
  onDeleteOccurrence?: (occurrenceId: string) => void
  onDeleteAssemblyConstraint?: (constraintId: string) => void
  onCreateAssemblyGroup?: (name: string, parentGroupId: string) => void
  onDeleteAssemblyGroup?: (groupId: string) => void
  onDuplicateOccurrence?: (occurrenceId: string) => void
  onMoveOccurrence?: (occurrenceId: string, targetIndex: number) => void
  onCaptureSubassembly?: (payload: CaptureCADSubassemblyPayload) => void
  onInstantiateSubassembly?: (definitionID: string, payload: InstantiateCADSubassemblyPayload) => Promise<void>
  onModelSelect: (modelId: string, nodeId: string, occurrenceId?: string) => void
  onParameterValuesChange: (modelId: string, parameterValues: Record<string, OpenSCADParameterValue>) => void
  onApplyGeneratedArtifactToModel?: (modelId: string, artifact: ProjectParametricArtifact, parameterValues: Record<string, OpenSCADParameterValue>) => void
  onResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onSaveGeneratedArtifactAsModel: (artifact: ProjectParametricArtifact, parameterValues: Record<string, OpenSCADParameterValue>) => void
  onSaveModelParameters: (modelId: string, parameterValues: Record<string, OpenSCADParameterValue>) => void
  onToggleModelVisibility: (modelId: string) => void
  onUpdateAssemblyGroup?: (groupId: string, payload: UpdateCADAssemblyGroupPayload) => void
  onUpdateOccurrence?: (occurrenceId: string, payload: UpdateCADAssemblyOccurrencePayload) => void
  occurrenceError?: string
  constraintError?: string
  subassemblyError?: string
  isAssemblyConstraintMutationPending?: boolean
  onTransformChange: (nodeId: string, axis: keyof CADTranslation, value: string) => void
  previewAssetModelIds: ReadonlySet<string>
  projectModelTree: ProjectModelTreeGroup[]
  selectedGeneratedArtifact?: ProjectParametricArtifact
  selectedNodeId: string
  selectedOccurrenceId?: string
  selectedSavedArtifact?: ProjectParametricArtifact
  unitLabel: string
  uploadError: string
}

// ProjectWorkbenchSidebar renders the controlled left workbench slot while route state stays in ProjectView.
export function ProjectWorkbenchSidebar({
  assemblyGroups = [],
  assemblyConstraints = [],
  assemblyOccurrences = [],
  assemblySubassemblies = [],
  documentDetails,
  hiddenModelIds,
  inspectorSelection,
  isLeftPanelCollapsed,
  isModelTreeLoading,
  isUploading,
  generatedArtifactRevisionTargetModelID = '',
  isOccurrenceMutationPending,
  isSubassemblyMutationPending,
  leftPanelWidth,
  modelCount,
  onCollapseChange,
  onDeleteOccurrence,
  onDeleteAssemblyConstraint,
  onCreateAssemblyGroup,
  onDeleteAssemblyGroup,
  onDuplicateOccurrence,
  onMoveOccurrence,
  onCaptureSubassembly,
  onInstantiateSubassembly,
  onModelSelect,
  onParameterValuesChange,
  onApplyGeneratedArtifactToModel,
  onResizePointerDown,
  onSaveGeneratedArtifactAsModel,
  onSaveModelParameters,
  onToggleModelVisibility,
  onUpdateAssemblyGroup,
  onUpdateOccurrence,
  occurrenceError,
  constraintError,
  subassemblyError,
  isAssemblyConstraintMutationPending,
  onTransformChange,
  previewAssetModelIds,
  projectModelTree,
  selectedGeneratedArtifact,
  selectedNodeId,
  selectedOccurrenceId = '',
  selectedSavedArtifact,
  unitLabel,
  uploadError,
}: ProjectWorkbenchSidebarProps) {
  const { t } = useTranslation()
  const LeftPanelIcon = isLeftPanelCollapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <aside
      className={`absolute left-4 top-4 z-30 hidden border border-[#e2e8f0] bg-[#ffffff]/92 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur lg:block ${
        isLeftPanelCollapsed ? 'w-[196px] rounded-[14px] px-3 py-1.5' : 'bottom-4 overflow-y-auto rounded-md p-3'
      }`}
      style={isLeftPanelCollapsed ? undefined : ({ width: leftPanelWidth } satisfies CSSProperties)}
    >
      {isLeftPanelCollapsed ? (
        <div className="flex min-h-7 items-center gap-2.5">
          <Box className="size-3.5 shrink-0 text-[#0f172a]" />
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-[#0f172a]">{t('project.sidebar.project')}</p>
            <span className="shrink-0 rounded bg-[#eff6ff] px-1.5 py-0.5 text-[11px] font-medium leading-none text-[#0074d9]">{t('project.sidebar.modelCount', { count: modelCount })}</span>
          </div>
          <button
            aria-label={t('project.sidebar.expand')}
            className="grid size-6 shrink-0 place-items-center rounded text-[#0f172a] transition hover:bg-[#f1f5f9]"
            onClick={() => onCollapseChange(false)}
            title={t('project.sidebar.expand')}
            type="button"
          >
            <LeftPanelIcon className="size-3.5" />
          </button>
        </div>
      ) : (
        <>
          <div
            aria-label={t('project.sidebar.resize')}
            aria-orientation="vertical"
            className="group absolute right-0 top-0 z-40 h-full w-2 cursor-col-resize"
            onPointerDown={onResizePointerDown}
            role="separator"
            title={t('project.sidebar.resize')}
          >
            <span className="absolute bottom-3 right-0 top-3 w-px rounded-full bg-transparent transition group-hover:bg-[#94a3b8]" />
          </div>

          <div className="flex min-h-full flex-col">
            <ProjectModelTree
              assemblyGroups={assemblyGroups}
              groups={projectModelTree}
              headerAction={
                <button
                  aria-label={t('project.sidebar.collapse')}
                  className="grid size-8 place-items-center rounded-md text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                  onClick={() => onCollapseChange(true)}
                  title={t('project.sidebar.collapse')}
                  type="button"
                >
                  <LeftPanelIcon className="size-4" />
                </button>
              }
              hiddenModelIds={hiddenModelIds}
              isLoading={isModelTreeLoading}
              isUploading={isUploading}
              isOccurrenceMutationPending={isOccurrenceMutationPending}
              isSubassemblyMutationPending={isSubassemblyMutationPending}
              onCaptureSubassembly={onCaptureSubassembly}
              onCreateAssemblyGroup={onCreateAssemblyGroup}
              onDeleteAssemblyGroup={onDeleteAssemblyGroup}
              onDeleteOccurrence={onDeleteOccurrence}
              onDuplicateOccurrence={onDuplicateOccurrence}
              onMoveOccurrence={onMoveOccurrence}
              onSelect={onModelSelect}
              onToggleVisibility={onToggleModelVisibility}
              onUpdateAssemblyGroup={onUpdateAssemblyGroup}
              onUpdateOccurrence={onUpdateOccurrence}
              occurrenceError={occurrenceError}
              previewAssetModelIds={previewAssetModelIds}
              selectedNodeId={selectedNodeId}
              selectedOccurrenceId={selectedOccurrenceId}
              uploadError={uploadError}
            />

            {subassemblyError ? (
              <p className="mt-2 px-2 py-1 text-xs text-destructive" role="alert">
                {subassemblyError}
              </p>
            ) : null}

            <ProjectSubassemblies definitions={assemblySubassemblies} isPending={isSubassemblyMutationPending} onInstantiate={onInstantiateSubassembly} />

            <ProjectAssemblyConstraints constraints={assemblyConstraints} error={constraintError} isPending={isAssemblyConstraintMutationPending} occurrences={assemblyOccurrences} onDelete={onDeleteAssemblyConstraint} />

            {selectedGeneratedArtifact ? (
              <ParametricArtifactEditor
                artifact={selectedGeneratedArtifact}
                autoSaveOnPreviewSuccess={selectedGeneratedArtifact.source_kind === 'litecad-feature-dsl'}
                onSaveAsModel={(parameterValues) => {
                  if (generatedArtifactRevisionTargetModelID && onApplyGeneratedArtifactToModel) {
                    onApplyGeneratedArtifactToModel(generatedArtifactRevisionTargetModelID, selectedGeneratedArtifact, parameterValues)
                    return
                  }
                  onSaveGeneratedArtifactAsModel(selectedGeneratedArtifact, parameterValues)
                }}
              />
            ) : selectedSavedArtifact ? (
              <ParametricArtifactEditor
                artifact={selectedSavedArtifact}
                initialParameterValues={selectedSavedArtifact.parameter_values}
                onParameterValuesChange={(parameterValues) => onParameterValuesChange(selectedSavedArtifact.preview_model_id, parameterValues)}
                onSaveParameters={(parameterValues) => onSaveModelParameters(selectedSavedArtifact.preview_model_id, parameterValues)}
              />
            ) : null}

            {!selectedGeneratedArtifact && (!selectedSavedArtifact || inspectorSelection) ? (
              <ProjectInspector documentDetails={documentDetails} modelCount={modelCount} onTransformChange={onTransformChange} selected={inspectorSelection} unitLabel={unitLabel} />
            ) : null}
          </div>
        </>
      )}
    </aside>
  )
}
