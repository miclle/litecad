import type { CSSProperties } from 'react'
import { useState } from 'react'
import { Box, Download, HardDrive, Layers, LoaderCircle, RefreshCw, Ruler, Save, ScanLine, ScanSearch, Trash2, Undo2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { CADDocumentNode, ProjectCADDocument, ProjectInspectionRecord, ProjectModel, ProjectSectionArtifact } from 'src/types/project'
import type { CADTranslation } from './cad-document-transforms'
import type { BoxFeatureDraft } from './cad-document-box-features'
import { ModelPreview, type ModelPreviewSnapshotCapture } from './model-preview'
import { defaultModelPreviewDisplayOptions, type ModelPreviewDisplayOptions, type ModelPreviewMeasurement } from './model-preview-tools'
import type { ProjectPreviewAsset } from './project-preview-assets'
import { ViewController } from './view-controller'
import type { CADTool } from './use-project-selection-controller'
import type { ViewOrientation, ViewRotationStep } from './view-orientation'
import type { ProjectSectionArtifactState } from './use-project-section-artifacts-controller'

type ProjectCanvasProps = {
  activeCADTool: CADTool
  animateViewCubeOrientation: boolean
  canGenerateSectionGeometry?: boolean
  canAnalyzeTopology?: boolean
  canvasRightOffset: number
  canvasStatusBody: string
  canvasStatusLabel: string
  canvasStatusLeftOffset: number
  deferResize: boolean
  draftModelTranslations: Record<string, CADTranslation>
  getSectionArtifactState?: (artifact: ProjectSectionArtifact) => ProjectSectionArtifactState
  modelTranslations: Record<string, CADTranslation>
  onApplyBoxFeatureDraft: (modelId: string) => void
  onAnalyzeTopology?: () => void
  onClearSelection: () => void
  onCloseCADTool: () => void
  onFlipOrientation: () => void
	onModelTranslationChange: (modelId: string, translation: CADTranslation, nodeId?: string, occurrenceId?: string) => void
  onResetIsometric: () => void
  onDeleteInspectionRecord?: (recordId: string) => void
  onDeleteSectionArtifact?: (artifactId: string) => void
  onDownloadSectionArtifact?: (artifactId: string) => void
  onGenerateSectionArtifact?: (planeOrigin: { x: number; y: number; z: number }) => void
  onRegenerateSectionArtifact?: (artifact: ProjectSectionArtifact) => void
  onRestoreInspectionRecord?: (record: ProjectInspectionRecord) => void
  onRestoreSectionArtifact?: (artifact: ProjectSectionArtifact) => void
  onSaveMeasurementRecord?: (measurement: ModelPreviewMeasurement) => void
	onSelectModel: (modelId: string, nodeId?: string, occurrenceId?: string) => void
  onSetOrientation: (orientation: ViewOrientation) => void
  onSnapshotCapture: (snapshot: ModelPreviewSnapshotCapture) => void
  onStepOrientation: (step: ViewRotationStep) => void
  onToggleFuseBoxTool: () => void
  onUpdateBoxFeatureDraft: (modelId: string, field: keyof BoxFeatureDraft, value: string) => void
  previewAssets: ProjectPreviewAsset[]
  inspectionRecords?: readonly ProjectInspectionRecord[]
  isInspectionRecordsLoading?: boolean
  isInspectionRecordMutationPending?: boolean
  isSectionArtifactMutationPending?: boolean
  isSectionArtifactsLoading?: boolean
  projectCADDocument?: ProjectCADDocument
  projectId: string
  isSelectedModelBoxFeatureUpdating: boolean
  selectedDocumentNode?: CADDocumentNode
  selectedModelBoxFeatureDraft?: BoxFeatureDraft
  selectedModelBoxFeatureError: string
  selectedModelDisplayName: string
  selectedModelId: string
	selectedOccurrenceId?: string
  selectedModelSupportsFuseBox: boolean
  selectedNodeId: string
  selectedSourceModel?: ProjectModel
  sectionArtifactError?: string
  inspectionRecordError?: string
  sectionArtifacts?: readonly ProjectSectionArtifact[]
  shouldShowCanvasStatus: boolean
  unitLabel: string
  viewOrientation: ViewOrientation
  visibleModelIds: readonly string[]
}

type PreviewTool = {
  description: string
  icon: typeof Ruler
  key: keyof ModelPreviewDisplayOptions
  label: string
}

function NumericCADField({
  ariaLabel,
  label,
  onChange,
  unitLabel,
  value,
}: {
  ariaLabel: string
  label: string
  onChange: (value: string) => void
  unitLabel: string
  value: string
}) {
  return (
    <Field className="gap-1" orientation="vertical">
      <FieldLabel className="text-[10px] font-medium uppercase tracking-normal text-[#64748b]">{label}</FieldLabel>
      <div className="relative">
        <Input
          aria-label={ariaLabel}
          className="h-8 rounded-md border-[#dbe3ec] bg-white pr-8 text-right font-mono text-[11px] text-[#334155] focus-visible:border-[#64748b] focus-visible:ring-[#cbd5e1]"
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value)}
          type="text"
          value={value}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#94a3b8]">{unitLabel}</span>
      </div>
    </Field>
  )
}

// ProjectCanvas renders the controlled workbench canvas slot without owning route state.
export function ProjectCanvas({
  activeCADTool,
  animateViewCubeOrientation,
  canGenerateSectionGeometry = false,
  canAnalyzeTopology = false,
  canvasRightOffset,
  canvasStatusBody,
  canvasStatusLabel,
  canvasStatusLeftOffset,
  deferResize,
  draftModelTranslations,
  getSectionArtifactState = () => 'legacy',
  modelTranslations,
  onApplyBoxFeatureDraft,
  onAnalyzeTopology,
  onClearSelection,
  onCloseCADTool,
  onFlipOrientation,
  onModelTranslationChange,
  onResetIsometric,
  onDeleteInspectionRecord,
  onDeleteSectionArtifact,
  onDownloadSectionArtifact,
  onGenerateSectionArtifact,
  onRegenerateSectionArtifact,
  onRestoreInspectionRecord,
  onRestoreSectionArtifact,
  onSaveMeasurementRecord,
  onSelectModel,
  onSetOrientation,
  onSnapshotCapture,
  onStepOrientation,
  onToggleFuseBoxTool,
  onUpdateBoxFeatureDraft,
  previewAssets,
  inspectionRecords = [],
  isInspectionRecordsLoading = false,
  isInspectionRecordMutationPending = false,
  isSectionArtifactMutationPending = false,
  isSectionArtifactsLoading = false,
  projectCADDocument,
  projectId,
  isSelectedModelBoxFeatureUpdating,
  selectedDocumentNode,
  selectedModelBoxFeatureDraft,
  selectedModelBoxFeatureError,
  selectedModelDisplayName,
  selectedModelId,
	selectedOccurrenceId = '',
  selectedModelSupportsFuseBox,
  selectedNodeId,
  selectedSourceModel,
  sectionArtifactError = '',
  inspectionRecordError = '',
  sectionArtifacts = [],
  shouldShowCanvasStatus,
  unitLabel,
  viewOrientation,
  visibleModelIds,
}: ProjectCanvasProps) {
  const { t } = useTranslation()
  const [displayOptions, setDisplayOptions] = useState<ModelPreviewDisplayOptions>(defaultModelPreviewDisplayOptions)
  const [currentMeasurement, setCurrentMeasurement] = useState<ModelPreviewMeasurement | undefined>(undefined)
  const [sectionPlaneOrigin, setSectionPlaneOrigin] = useState<{ x: number; y: number; z: number } | undefined>(undefined)
  const previewTools: PreviewTool[] = [
    { description: t('project.canvas.edgesDescription'), icon: Layers, key: 'showEdges', label: t('project.canvas.edges') },
    { description: t('project.canvas.sectionDescription'), icon: ScanLine, key: 'section', label: t('project.canvas.section') },
    { description: t('project.canvas.measureDescription'), icon: Ruler, key: 'measurement', label: t('project.canvas.measure') },
  ]
  const toggleDisplayOption = (key: keyof ModelPreviewDisplayOptions) => {
    if (key === 'section' && !displayOptions.section) {
      setSectionPlaneOrigin(undefined)
    }
    setDisplayOptions((currentOptions) => ({ ...currentOptions, [key]: !currentOptions[key] }))
  }

  return (
    <section className="absolute inset-0 overflow-hidden">
      <ModelPreview
        deferResize={deferResize}
        displayOptions={displayOptions}
        draftModelTranslations={draftModelTranslations}
        key={projectId}
        measurementOverlayClassName="sm:top-[168px]"
        modelTranslations={modelTranslations}
        onClearSelection={onClearSelection}
        onModelTranslationChange={onModelTranslationChange}
        onMeasurementChange={setCurrentMeasurement}
        onSelectModel={onSelectModel}
        onSnapshotCapture={onSnapshotCapture}
        previewAssets={previewAssets}
        selectedModelId={selectedModelId}
        selectedNodeId={selectedNodeId}
				selectedOccurrenceId={selectedOccurrenceId}
        sectionPlaneOrigin={sectionPlaneOrigin}
        unitLabel={unitLabel}
        visibleModelIds={visibleModelIds}
      />
      {previewAssets.length > 0 ? (
        <div className="absolute right-4 top-4 z-20 w-[min(320px,calc(100vw-32px))] rounded-md border border-[#dbe3ec] bg-white/94 p-3 shadow-[0_12px_32px_rgba(15,23,42,0.12)] backdrop-blur sm:top-[312px]">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] font-semibold uppercase text-[#64748b]">{t('project.canvas.inspectionRecords')}</p>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={t('project.canvas.analyzeTopology')}
                      disabled={!canAnalyzeTopology || !onAnalyzeTopology || isInspectionRecordMutationPending}
                      onClick={onAnalyzeTopology}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    />
                  }
                >
                  {isInspectionRecordMutationPending ? <LoaderCircle className="animate-spin" /> : <ScanSearch />}
                </TooltipTrigger>
                <TooltipContent sideOffset={8}>{t('project.canvas.analyzeTopology')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={t('project.canvas.saveMeasurement')}
                      disabled={!currentMeasurement || !displayOptions.measurement || !onSaveMeasurementRecord}
                      onClick={() => currentMeasurement && onSaveMeasurementRecord?.(currentMeasurement)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    />
                  }
                >
                  <Save />
                </TooltipTrigger>
                <TooltipContent sideOffset={8}>{t('project.canvas.saveMeasurement')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={t('project.canvas.generateSection')}
                      disabled={
                        !displayOptions.section ||
                        !currentMeasurement ||
                        !canGenerateSectionGeometry ||
                        !onGenerateSectionArtifact ||
                        isSectionArtifactMutationPending
                      }
                      onClick={() => currentMeasurement && onGenerateSectionArtifact?.(sectionPlaneOrigin ?? currentMeasurement.center)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    />
                  }
                >
                  {isSectionArtifactMutationPending ? <LoaderCircle className="animate-spin" /> : <ScanLine />}
                </TooltipTrigger>
                <TooltipContent sideOffset={8}>{t('project.canvas.generateSection')}</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="mt-2 space-y-1.5">
            {isInspectionRecordsLoading || isSectionArtifactsLoading ? (
              <p className="text-xs text-[#64748b]">{t('project.canvas.inspectionRecordsLoading')}</p>
            ) : inspectionRecords.length === 0 && sectionArtifacts.length === 0 ? (
              <p className="text-xs text-[#64748b]">{t('project.canvas.inspectionRecordsEmpty')}</p>
            ) : (
              <>
                {sectionArtifacts.slice(0, 3).map((artifact) => {
                  const artifactState = getSectionArtifactState(artifact)
                  return <div className="flex items-center justify-between gap-2 rounded border border-[#dbeafe] bg-[#eff6ff] px-2 py-1.5" key={artifact.id}>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[#0f172a]">{artifact.filename}</p>
                      <p className="font-mono text-[10px] uppercase text-[#64748b]">
                        {artifact.status === 'ready'
                          ? t('project.canvas.sectionGeometryEdges', { count: artifact.edge_count })
                          : t('project.canvas.sectionGeometryEmpty')}
                      </p>
                      {artifact.generation > 0 ? (
                        <p className="font-mono text-[10px] text-[#475569]">
                          {t('project.canvas.sectionGeneration', { generation: artifact.generation, state: t(`project.canvas.sectionState.${artifactState}`) })}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {artifactState === 'stale' ? (
                        <Button
                          aria-label={t('project.canvas.regenerateSectionArtifact', { name: artifact.filename })}
                          disabled={!onRegenerateSectionArtifact || isSectionArtifactMutationPending}
                          onClick={() => onRegenerateSectionArtifact?.(artifact)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <RefreshCw />
                        </Button>
                      ) : null}
                      <Button
                        aria-label={t('project.canvas.restoreInspectionRecord', { name: artifact.filename })}
                        onClick={() => {
                          setDisplayOptions((currentOptions) => ({ ...currentOptions, section: true }))
                          setSectionPlaneOrigin(artifact.plane_origin)
                          onRestoreSectionArtifact?.(artifact)
                        }}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Undo2 />
                      </Button>
                      <Button
                        aria-label={t('project.canvas.downloadSectionArtifact', { name: artifact.filename })}
                        disabled={artifact.status !== 'ready' || !onDownloadSectionArtifact}
                        onClick={() => onDownloadSectionArtifact?.(artifact.id)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Download />
                      </Button>
                      <Button
                        aria-label={t('project.canvas.deleteInspectionRecord', { name: artifact.filename })}
                        disabled={!onDeleteSectionArtifact}
                        onClick={() => onDeleteSectionArtifact?.(artifact.id)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                })}
                {inspectionRecords.slice(0, Math.max(0, 5 - sectionArtifacts.length)).map((record) => (
                <div className="flex items-center justify-between gap-2 rounded border border-[#e2e8f0] bg-[#f8fafc] px-2 py-1.5" key={record.id}>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-[#0f172a]">{record.name}</p>
                    <p className="font-mono text-[10px] uppercase text-[#64748b]">
                      {record.measurement?.derivation === 'occt-brep-properties'
                        ? t('project.canvas.exactBRepMeasurement')
                        : record.kind === 'measurement'
                          ? t('project.canvas.measurementRecord')
                          : t('project.canvas.sectionRecord')}
                    </p>
                    {record.measurement?.derivation === 'occt-brep-properties' ? (
                      <div className="font-mono text-[10px] text-[#475569]">
                        <p>
                          V {formatTopologyValue(record.measurement.topology.totals.volume)} · A {formatTopologyValue(record.measurement.topology.totals.surface_area)} · L {formatTopologyValue(record.measurement.topology.totals.edge_length)}
                        </p>
                        <p>
                          {t('project.canvas.topologyReferenceScope', {
                            count: record.measurement.topology.target_count,
                            references: record.measurement.topology.totals.face_count + record.measurement.topology.totals.edge_count,
                          })}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      aria-label={t('project.canvas.restoreInspectionRecord', { name: record.name })}
                      disabled={!onRestoreInspectionRecord}
                      onClick={() => {
                        setDisplayOptions((currentOptions) => ({
                          ...currentOptions,
                          measurement: record.kind === 'measurement' ? true : currentOptions.measurement,
                          section: record.kind === 'section' ? true : currentOptions.section,
                        }))
                        onRestoreInspectionRecord?.(record)
                      }}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Undo2 />
                    </Button>
                    <Button
                      aria-label={t('project.canvas.deleteInspectionRecord', { name: record.name })}
                      disabled={!onDeleteInspectionRecord}
                      onClick={() => onDeleteInspectionRecord?.(record.id)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                ))}
              </>
            )}
            {sectionArtifactError ? <p className="text-xs text-[#b91c1c]">{sectionArtifactError}</p> : null}
            {inspectionRecordError ? <p className="text-xs text-[#b91c1c]">{inspectionRecordError}</p> : null}
          </div>
        </div>
      ) : null}
      {shouldShowCanvasStatus ? (
        <div
          className="pointer-events-none absolute bottom-4 left-4 max-w-sm rounded-md border border-[#e2e8f0] bg-[#ffffff]/92 p-4 shadow-xl backdrop-blur lg:left-[var(--canvas-status-left)]"
          style={{ '--canvas-status-left': `${canvasStatusLeftOffset}px` } as CSSProperties}
        >
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase text-[#64748b]">
            <HardDrive className="size-4 text-[#475569]" />
            {canvasStatusLabel}
          </div>
          <p className="mt-2 text-sm leading-6 text-[#1f2937]">{canvasStatusBody}</p>
        </div>
      ) : null}

      <div
        aria-label={t('project.canvas.toolbar')}
        className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-md border border-[#dbe3ec] bg-white/94 p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.12)] backdrop-blur"
        role="toolbar"
      >
        <span className="px-1.5 font-mono text-[10px] font-semibold uppercase text-[#64748b]">{t('project.canvas.toolbar')}</span>
        {previewTools.map((tool) => {
          const Icon = tool.icon
          return (
            <Tooltip key={tool.key}>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={tool.label}
                    aria-pressed={displayOptions[tool.key]}
                    className={cn(
                      'min-w-[78px] justify-center',
                      displayOptions[tool.key] && 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8] hover:bg-[#dbeafe]',
                    )}
                    disabled={previewAssets.length === 0}
                    onClick={() => toggleDisplayOption(tool.key)}
                    size="sm"
                    type="button"
                    variant="outline"
                  />
                }
              >
                <Icon data-icon="inline-start" />
                <span className="truncate">{tool.label}</span>
              </TooltipTrigger>
              <TooltipContent sideOffset={8}>{previewAssets.length === 0 ? t('project.canvas.importFirst') : tool.description}</TooltipContent>
            </Tooltip>
          )
        })}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-pressed={activeCADTool === 'fuse-box' && selectedModelSupportsFuseBox}
                className={cn(
                  'min-w-[96px] justify-center',
                  activeCADTool === 'fuse-box' && selectedModelSupportsFuseBox && 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8] hover:bg-[#dbeafe]',
                )}
                disabled={!selectedModelSupportsFuseBox}
                onClick={onToggleFuseBoxTool}
                size="sm"
                type="button"
                variant="outline"
              />
            }
          >
            <Box data-icon="inline-start" />
            <span className="truncate">{t('project.canvas.fuseBox')}</span>
          </TooltipTrigger>
          {!selectedDocumentNode ? (
            <TooltipContent sideOffset={8}>{t('project.canvas.selectModelFirst')}</TooltipContent>
          ) : !selectedModelSupportsFuseBox ? (
            <TooltipContent sideOffset={8}>{t('project.canvas.stepOnly')}</TooltipContent>
          ) : null}
        </Tooltip>
      </div>

      {activeCADTool === 'fuse-box' && selectedModelSupportsFuseBox && selectedModelBoxFeatureDraft && selectedSourceModel ? (
        <aside
          aria-label={t('project.canvas.fuseBoxTool')}
          className="absolute right-4 top-40 z-20 w-[min(320px,calc(100vw-32px))] rounded-md border border-[#dbe3ec] bg-white/94 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.12)] backdrop-blur"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase text-[#64748b]">{t('project.canvas.tool')}</p>
              <h2 className="mt-1 text-sm font-semibold text-[#0f172a]">{t('project.canvas.fuseBox')}</h2>
              <p className="mt-1 text-xs leading-5 text-[#64748b]">{t('project.canvas.fuseBoxDescription')}</p>
            </div>
            <Button
              aria-label={t('project.canvas.closeFuseBox')}
              className="shrink-0"
              onClick={onCloseCADTool}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X />
            </Button>
          </div>

          <div className="mt-3 flex min-w-0 items-center gap-2 rounded border border-[#e2e8f0] bg-[#f8fafc] px-2 py-1.5">
            <Box className="size-3.5 shrink-0 text-[#1d4ed8]" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#334155]" title={selectedModelDisplayName}>
              {selectedModelDisplayName}
            </span>
            <span className="shrink-0 font-mono text-[10px] uppercase text-[#94a3b8]">{unitLabel}</span>
          </div>

          <FieldSet className="mt-3 gap-3">
            <FieldGroup className="gap-2">
              <FieldTitle className="text-xs text-[#334155]">{t('project.canvas.origin')}</FieldTitle>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['originX', t('project.canvas.originAxis', { axis: 'X' })],
                    ['originY', t('project.canvas.originAxis', { axis: 'Y' })],
                    ['originZ', t('project.canvas.originAxis', { axis: 'Z' })],
                  ] as const
                ).map(([field, label]) => (
                  <NumericCADField
                    ariaLabel={t('project.canvas.fieldFor', { label, name: selectedModelDisplayName })}
                    key={field}
                    label={label.replace(t('project.canvas.origin'), '').trim()}
                    onChange={(value) => onUpdateBoxFeatureDraft(selectedSourceModel.id, field, value)}
                    unitLabel={unitLabel}
                    value={selectedModelBoxFeatureDraft[field]}
                  />
                ))}
              </div>
            </FieldGroup>

            <FieldGroup className="gap-2">
              <FieldTitle className="text-xs text-[#334155]">{t('project.canvas.size')}</FieldTitle>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['sizeX', t('project.canvas.sizeAxis', { axis: 'X' })],
                    ['sizeY', t('project.canvas.sizeAxis', { axis: 'Y' })],
                    ['sizeZ', t('project.canvas.sizeAxis', { axis: 'Z' })],
                  ] as const
                ).map(([field, label]) => (
                  <NumericCADField
                    ariaLabel={t('project.canvas.fieldFor', { label, name: selectedModelDisplayName })}
                    key={field}
                    label={label.replace(t('project.canvas.size'), '').trim()}
                    onChange={(value) => onUpdateBoxFeatureDraft(selectedSourceModel.id, field, value)}
                    unitLabel={unitLabel}
                    value={selectedModelBoxFeatureDraft[field]}
                  />
                ))}
              </div>
            </FieldGroup>

            {selectedModelBoxFeatureError ? <FieldError className="text-[11px] leading-4">{selectedModelBoxFeatureError}</FieldError> : null}

            <div className="grid grid-cols-[1fr_auto] gap-1.5">
              <Button
                className="justify-center"
                disabled={isSelectedModelBoxFeatureUpdating || !projectCADDocument}
                onClick={() => onApplyBoxFeatureDraft(selectedSourceModel.id)}
                size="sm"
                type="button"
              >
                <Box data-icon="inline-start" />
                {isSelectedModelBoxFeatureUpdating ? t('project.canvas.applying') : t('project.canvas.applyFuse')}
              </Button>
              <Button onClick={onCloseCADTool} size="sm" type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </div>
          </FieldSet>
        </aside>
      ) : null}

      <ViewController
        animateViewCubeOrientation={animateViewCubeOrientation}
        className="xl:right-[var(--view-controller-right)]"
        onFlip={onFlipOrientation}
        onResetIsometric={onResetIsometric}
        onSetOrientation={onSetOrientation}
        onStep={onStepOrientation}
        orientation={viewOrientation}
        style={{ '--view-controller-right': `${canvasRightOffset}px` } as CSSProperties}
      />
    </section>
  )
}

function formatTopologyValue(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value)
}
