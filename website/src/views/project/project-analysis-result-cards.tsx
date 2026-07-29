import { Download, RefreshCw, Trash2, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ProjectInspectionRecord, ProjectSectionArtifact } from 'src/types/project'
import { cadUnitLabel } from './cad-unit-label'
import type { ProjectSectionArtifactState } from './use-project-section-artifacts-controller'

type SectionArtifactCardProps = {
  artifact: ProjectSectionArtifact
  artifactState: ProjectSectionArtifactState
  isMutationPending: boolean
  locale: string
  onDelete?: (artifactId: string) => void
  onDownload?: (artifactId: string) => void
  onRegenerate?: (artifact: ProjectSectionArtifact) => void
  onRestore: (artifact: ProjectSectionArtifact) => void
}

export function SectionArtifactCard({
  artifact,
  artifactState,
  isMutationPending,
  locale,
  onDelete,
  onDownload,
  onRegenerate,
  onRestore,
}: SectionArtifactCardProps) {
  const { t } = useTranslation()
  const createdAt = formatAnalysisDateTime(artifact.created_at, locale)
  const artifactActionName = artifact.generation > 0
    ? t('project.canvas.sectionArtifactGenerationName', { createdAt, generation: artifact.generation, name: artifact.filename })
    : t('project.canvas.sectionArtifactSavedName', { createdAt, name: artifact.filename })

  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/55 px-2 py-2">
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
            disabled={!onRegenerate || isMutationPending}
            label={t('project.canvas.regenerateSectionArtifact', { name: artifactActionName })}
            onClick={() => onRegenerate?.(artifact)}
            tooltip={t('project.canvas.regenerateSectionArtifact', { name: artifact.filename })}
          >
            <RefreshCw />
          </AnalysisIconButton>
        ) : null}
        <AnalysisIconButton
          label={t('project.canvas.restoreInspectionRecord', { name: artifactActionName })}
          onClick={() => onRestore(artifact)}
          tooltip={t('project.canvas.restoreInspectionRecord', { name: artifact.filename })}
        >
          <Undo2 />
        </AnalysisIconButton>
        <AnalysisIconButton
          disabled={artifact.status !== 'ready' || !onDownload}
          label={t('project.canvas.downloadSectionArtifact', { name: artifactActionName })}
          onClick={() => onDownload?.(artifact.id)}
          tooltip={t('project.canvas.downloadSectionArtifact', { name: artifact.filename })}
        >
          <Download />
        </AnalysisIconButton>
        <AnalysisIconButton
          disabled={!onDelete || isMutationPending}
          label={t('project.canvas.deleteInspectionRecord', { name: artifactActionName })}
          onClick={() => onDelete?.(artifact.id)}
          tooltip={t('project.canvas.deleteInspectionRecord', { name: artifact.filename })}
        >
          <Trash2 />
        </AnalysisIconButton>
      </div>
    </div>
  )
}

type InspectionRecordCardProps = {
  isCurrent: boolean
  isMutationPending: boolean
  locale: string
  onDelete?: (recordId: string) => void
  record: ProjectInspectionRecord
}

export function InspectionRecordCard({
  isCurrent,
  isMutationPending,
  locale,
  onDelete,
  record,
}: InspectionRecordCardProps) {
  const { t } = useTranslation()
  const measurement = record.measurement
  const recordUnitLabel = cadUnitLabel(record.unit)
  const displayName = measurement?.derivation === 'occt-brep-properties'
    ? t('project.canvas.exactBRepMeasurement')
    : measurement?.derivation === 'preview-visible-aabb'
      ? t('project.canvas.visibleBoundsMeasurement')
      : record.name
  const createdAt = formatAnalysisDateTime(record.created_at, locale)
  const metadata = t('project.canvas.analysisRecordMetadata', {
    createdAt,
    revision: record.cad_document_revision,
    state: isCurrent ? '' : t('project.canvas.analysisRecordEarlier'),
  })
  const recordActionName = t('project.canvas.analysisRecordActionName', { metadata, name: displayName })

  return (
    <div className="flex items-start justify-between gap-2 rounded-md bg-muted/55 px-2 py-2">
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
        disabled={!onDelete || isMutationPending}
        label={t('project.canvas.deleteInspectionRecord', { name: recordActionName })}
        onClick={() => onDelete?.(record.id)}
        tooltip={t('project.canvas.deleteInspectionRecord', { name: displayName })}
      >
        <Trash2 />
      </AnalysisIconButton>
    </div>
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
