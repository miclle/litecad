import { Download, RefreshCw, Save, ScanLine, ScanSearch, Trash2, Undo2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ProjectInspectionRecord, ProjectSectionArtifact } from 'src/types/project'
import { cadUnitLabel } from './cad-unit-label'
import type { ModelPreviewDisplayOptions, ModelPreviewMeasurement } from './model-preview-tools'
import type { ProjectSectionArtifactState } from './use-project-section-artifacts-controller'

type ProjectAnalysisPopoverProps = {
  canAnalyzeTopology: boolean
  canGenerateSectionGeometry: boolean
  currentCADDocumentRevision?: number
  currentMeasurement?: ModelPreviewMeasurement
  displayOptions: ModelPreviewDisplayOptions
  getSectionArtifactState: (artifact: ProjectSectionArtifact) => ProjectSectionArtifactState
  inspectionRecordError: string
  inspectionRecords: readonly ProjectInspectionRecord[]
  isInspectionRecordMutationPending: boolean
  isInspectionRecordsLoading: boolean
  isSectionArtifactMutationPending: boolean
  isSectionArtifactsLoading: boolean
  onAnalyzeTopology?: () => void
  onDeleteInspectionRecord?: (recordId: string) => void
  onDeleteSectionArtifact?: (artifactId: string) => void
  onDownloadSectionArtifact?: (artifactId: string) => void
  onGenerateSectionArtifact?: (planeOrigin: { x: number; y: number; z: number }) => void
  onRegenerateSectionArtifact?: (artifact: ProjectSectionArtifact) => void
  onRestoreSectionArtifact: (artifact: ProjectSectionArtifact) => void
  onSaveMeasurementRecord?: (measurement: ModelPreviewMeasurement) => void
  sectionArtifactError: string
  sectionArtifacts: readonly ProjectSectionArtifact[]
  sectionPlaneOrigin?: { x: number; y: number; z: number }
}

const initialResultLimit = 20

export function ProjectAnalysisPopover({
  canAnalyzeTopology,
  canGenerateSectionGeometry,
  currentCADDocumentRevision,
  currentMeasurement,
  displayOptions,
  getSectionArtifactState,
  inspectionRecordError,
  inspectionRecords,
  isInspectionRecordMutationPending,
  isInspectionRecordsLoading,
  isSectionArtifactMutationPending,
  isSectionArtifactsLoading,
  onAnalyzeTopology,
  onDeleteInspectionRecord,
  onDeleteSectionArtifact,
  onDownloadSectionArtifact,
  onGenerateSectionArtifact,
  onRegenerateSectionArtifact,
  onRestoreSectionArtifact,
  onSaveMeasurementRecord,
  sectionArtifactError,
  sectionArtifacts,
  sectionPlaneOrigin,
}: ProjectAnalysisPopoverProps) {
  const { i18n, t } = useTranslation()
  const [showAllResults, setShowAllResults] = useState(false)
  const resultCount = inspectionRecords.length + sectionArtifacts.length
  const isLoading = isInspectionRecordsLoading || isSectionArtifactsLoading
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const visibleSectionArtifacts = showAllResults ? sectionArtifacts : sectionArtifacts.slice(0, initialResultLimit)
  const visibleInspectionRecords = showAllResults
    ? inspectionRecords
    : inspectionRecords.slice(0, Math.max(0, initialResultLimit - visibleSectionArtifacts.length))

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={t('project.canvas.analysisRecordsCount', { count: resultCount })}
            className="min-w-[92px] justify-center"
            size="sm"
            type="button"
            variant="outline"
          />
        }
      >
        <ScanSearch data-icon="inline-start" />
        <span className="truncate">{t('project.canvas.analysisRecordsCount', { count: resultCount })}</span>
      </PopoverTrigger>

      <PopoverContent
        align="center"
        aria-label={t('project.canvas.analysisTitle')}
        className="max-h-[min(32rem,calc(100dvh-5rem),var(--available-height))] w-[min(420px,calc(100vw-24px))] gap-0 overflow-hidden rounded-md bg-popover/96 p-0 text-left shadow-[0_16px_42px_rgba(15,23,42,0.14)] backdrop-blur"
        side="top"
        sideOffset={10}
      >
        <PopoverArrow />
        <PopoverHeader className="p-3">
          <PopoverTitle>{t('project.canvas.analysisTitle')}</PopoverTitle>
          <PopoverDescription className="text-xs leading-5">{t('project.canvas.analysisDescription')}</PopoverDescription>
        </PopoverHeader>

        <Separator />

        <div className="grid gap-2 p-3">
          <Button
            className="justify-start"
            disabled={!currentMeasurement || !displayOptions.measurement || !onSaveMeasurementRecord || isInspectionRecordMutationPending}
            onClick={() => currentMeasurement && onSaveMeasurementRecord?.(currentMeasurement)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Save data-icon="inline-start" />
            {t('project.canvas.saveMeasurement')}
          </Button>
          <Button
            className="justify-start"
            disabled={!canAnalyzeTopology || !onAnalyzeTopology || isInspectionRecordMutationPending}
            onClick={onAnalyzeTopology}
            size="sm"
            type="button"
            variant="outline"
          >
            <ScanSearch data-icon="inline-start" />
            {t('project.canvas.analyzeTopology')}
          </Button>
          <Button
            className="justify-start"
            disabled={
              !displayOptions.section ||
              !currentMeasurement ||
              !canGenerateSectionGeometry ||
              !onGenerateSectionArtifact ||
              isSectionArtifactMutationPending
            }
            onClick={() => currentMeasurement && onGenerateSectionArtifact?.(sectionPlaneOrigin ?? currentMeasurement.center)}
            size="sm"
            type="button"
            variant="outline"
          >
            <ScanLine data-icon="inline-start" />
            {t('project.canvas.generateSection')}
          </Button>
          {inspectionRecordError ? (
            <p className="text-xs leading-5 text-destructive" role="alert">{t('project.canvas.analysisActionFailed')}</p>
          ) : null}
          {sectionArtifactError ? (
            <p className="text-xs leading-5 text-destructive" role="alert">{t('project.canvas.sectionActionFailed')}</p>
          ) : null}
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <h3 className="text-xs font-medium text-foreground">{t('project.canvas.savedResults')}</h3>
          <span className="font-mono text-[10px] text-muted-foreground">{resultCount}</span>
        </div>

        <div className="flex max-h-72 min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
          {isLoading ? <p className="px-1 py-3 text-xs text-muted-foreground">{t('project.canvas.inspectionRecordsLoading')}</p> : null}
          {!isLoading && resultCount === 0 ? (
            <p className="px-1 py-3 text-xs leading-5 text-muted-foreground">{t('project.canvas.inspectionRecordsEmpty')}</p>
          ) : null}

          {visibleSectionArtifacts.map((artifact) => {
            const artifactState = getSectionArtifactState(artifact)
            const createdAt = formatAnalysisDateTime(artifact.created_at, locale)
            const artifactActionName = artifact.generation > 0
              ? t('project.canvas.sectionArtifactGenerationName', { createdAt, generation: artifact.generation, name: artifact.filename })
              : t('project.canvas.sectionArtifactSavedName', { createdAt, name: artifact.filename })
            return (
              <div className="flex items-center justify-between gap-2 rounded-md bg-muted/55 px-2 py-2" key={artifact.id}>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">{artifact.filename}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {artifact.status === 'ready'
                      ? t('project.canvas.sectionGeometryEdges', { count: artifact.edge_count })
                      : t('project.canvas.sectionGeometryEmpty')}
                  </p>
                  {artifact.generation > 0 ? (
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {t('project.canvas.sectionGeneration', {
                        generation: artifact.generation,
                        state: t(`project.canvas.sectionState.${artifactState}`),
                      })}
                    </p>
                  ) : null}
                  <p className="font-mono text-[10px] text-muted-foreground">
                    <time dateTime={artifact.created_at}>{t('project.canvas.savedAt', { createdAt })}</time>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {artifactState === 'stale' ? (
                    <AnalysisIconButton
                      disabled={!onRegenerateSectionArtifact || isSectionArtifactMutationPending}
                      label={t('project.canvas.regenerateSectionArtifact', { name: artifactActionName })}
                      onClick={() => onRegenerateSectionArtifact?.(artifact)}
                      tooltip={t('project.canvas.regenerateSectionArtifact', { name: artifact.filename })}
                    >
                      <RefreshCw />
                    </AnalysisIconButton>
                  ) : null}
                  <AnalysisIconButton
                    label={t('project.canvas.restoreInspectionRecord', { name: artifactActionName })}
                    onClick={() => onRestoreSectionArtifact(artifact)}
                    tooltip={t('project.canvas.restoreInspectionRecord', { name: artifact.filename })}
                  >
                    <Undo2 />
                  </AnalysisIconButton>
                  <AnalysisIconButton
                    disabled={artifact.status !== 'ready' || !onDownloadSectionArtifact}
                    label={t('project.canvas.downloadSectionArtifact', { name: artifactActionName })}
                    onClick={() => onDownloadSectionArtifact?.(artifact.id)}
                    tooltip={t('project.canvas.downloadSectionArtifact', { name: artifact.filename })}
                  >
                    <Download />
                  </AnalysisIconButton>
                  <AnalysisIconButton
                    disabled={!onDeleteSectionArtifact || isSectionArtifactMutationPending}
                    label={t('project.canvas.deleteInspectionRecord', { name: artifactActionName })}
                    onClick={() => onDeleteSectionArtifact?.(artifact.id)}
                    tooltip={t('project.canvas.deleteInspectionRecord', { name: artifact.filename })}
                  >
                    <Trash2 />
                  </AnalysisIconButton>
                </div>
              </div>
            )
          })}

          {visibleInspectionRecords.map((record) => {
            const measurement = record.measurement
            const recordUnitLabel = cadUnitLabel(record.unit)
            const displayName = measurement?.derivation === 'occt-brep-properties'
              ? t('project.canvas.exactBRepMeasurement')
              : measurement?.derivation === 'preview-visible-aabb'
                ? t('project.canvas.visibleBoundsMeasurement')
                : record.name
            const createdAt = formatAnalysisDateTime(record.created_at, locale)
            const isEarlierResult = currentCADDocumentRevision !== undefined && record.cad_document_revision !== currentCADDocumentRevision
            const metadata = t('project.canvas.analysisRecordMetadata', {
              createdAt,
              revision: record.cad_document_revision,
              state: isEarlierResult ? t('project.canvas.analysisRecordEarlier') : '',
            })
            const recordActionName = t('project.canvas.analysisRecordActionName', { metadata, name: displayName })

            return (
              <div className="flex items-start justify-between gap-2 rounded-md bg-muted/55 px-2 py-2" key={record.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{displayName}</p>
                  {measurement?.derivation === 'occt-brep-properties' ? (
                    <div className="mt-1 grid gap-0.5 font-mono text-[10px] text-muted-foreground">
                      <p>{t('project.canvas.volume')} {formatAnalysisValue(measurement.topology.totals.volume, locale)} {recordUnitLabel}³</p>
                      <p>{t('project.canvas.surfaceArea')} {formatAnalysisValue(measurement.topology.totals.surface_area, locale)} {recordUnitLabel}²</p>
                      <p>{t('project.canvas.edgeLength')} {formatAnalysisValue(measurement.topology.totals.edge_length, locale)} {recordUnitLabel}</p>
                    </div>
                  ) : measurement?.derivation === 'preview-visible-aabb' ? (
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      X {formatAnalysisValue(measurement.size.x, locale)} · Y {formatAnalysisValue(measurement.size.y, locale)} · Z{' '}
                      {formatAnalysisValue(measurement.size.z, locale)} {recordUnitLabel}
                    </p>
                  ) : (
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {record.kind === 'measurement' ? t('project.canvas.measurementRecord') : t('project.canvas.sectionRecord')}
                    </p>
                  )}
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    <time dateTime={record.created_at}>{metadata}</time>
                  </p>
                </div>
                <AnalysisIconButton
                  disabled={!onDeleteInspectionRecord || isInspectionRecordMutationPending}
                  label={t('project.canvas.deleteInspectionRecord', { name: recordActionName })}
                  onClick={() => onDeleteInspectionRecord?.(record.id)}
                  tooltip={t('project.canvas.deleteInspectionRecord', { name: displayName })}
                >
                  <Trash2 />
                </AnalysisIconButton>
              </div>
            )
          })}

          {!showAllResults && resultCount > initialResultLimit ? (
            <Button className="mx-1 mt-1" onClick={() => setShowAllResults(true)} size="sm" type="button" variant="ghost">
              {t('project.canvas.showAllResults', { count: resultCount })}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function formatAnalysisValue(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value)
}

function formatAnalysisDateTime(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function AnalysisIconButton({ children, disabled, label, onClick, tooltip }: {
  children: ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
  tooltip: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{tooltip}</TooltipContent>
    </Tooltip>
  )
}
