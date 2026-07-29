import { ChevronDown, Save, ScanLine, ScanSearch } from 'lucide-react'
import { useState } from 'react'
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
import type { ProjectInspectionRecord, ProjectSectionArtifact } from 'src/types/project'
import type { ModelPreviewDisplayOptions, ModelPreviewMeasurement } from './model-preview-tools'
import { InspectionRecordCard, SectionArtifactCard } from './project-analysis-result-cards'
import type { ProjectSectionArtifactState } from './use-project-section-artifacts-controller'

type ProjectAnalysisPopoverProps = {
  canAnalyzeTopology: boolean
  canGenerateSectionGeometry: boolean
  currentCADDocumentRevision?: number
  currentMeasurement?: ModelPreviewMeasurement
  currentVisibleModelIds: readonly string[]
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

const initialHistoryLimit = 20

export function ProjectAnalysisPopover({
  canAnalyzeTopology,
  canGenerateSectionGeometry,
  currentCADDocumentRevision,
  currentMeasurement,
  currentVisibleModelIds,
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
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const resultCount = inspectionRecords.length + sectionArtifacts.length
  const isLoading = isInspectionRecordsLoading || isSectionArtifactsLoading
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const currentInspectionRecords = latestCurrentInspectionRecords(
    inspectionRecords,
    currentCADDocumentRevision,
    currentVisibleModelIds,
  )
  const currentInspectionRecordIds = new Set(currentInspectionRecords.map((record) => record.id))
  const currentSectionArtifacts = sectionArtifacts.filter((artifact) => {
    const state = getSectionArtifactState(artifact)
    return state === 'current' || (state === 'stale' && artifact.is_latest)
  })
  const currentSectionArtifactIds = new Set(currentSectionArtifacts.map((artifact) => artifact.id))
  const historyInspectionRecords = inspectionRecords.filter((record) => !currentInspectionRecordIds.has(record.id))
  const historySectionArtifacts = sectionArtifacts.filter((artifact) => !currentSectionArtifactIds.has(artifact.id))
  const currentResultCount = currentInspectionRecords.length + currentSectionArtifacts.length
  const historyCount = historyInspectionRecords.length + historySectionArtifacts.length
  const visibleHistorySectionArtifacts = showAllHistory
    ? historySectionArtifacts
    : historySectionArtifacts.slice(0, initialHistoryLimit)
  const visibleHistoryInspectionRecords = showAllHistory
    ? historyInspectionRecords
    : historyInspectionRecords.slice(0, Math.max(0, initialHistoryLimit - visibleHistorySectionArtifacts.length))
  const renderSectionArtifact = (artifact: ProjectSectionArtifact) => (
    <SectionArtifactCard
      artifact={artifact}
      artifactState={getSectionArtifactState(artifact)}
      isMutationPending={isSectionArtifactMutationPending}
      key={artifact.id}
      locale={locale}
      onDelete={onDeleteSectionArtifact}
      onDownload={onDownloadSectionArtifact}
      onRegenerate={onRegenerateSectionArtifact}
      onRestore={onRestoreSectionArtifact}
    />
  )
  const renderInspectionRecord = (record: ProjectInspectionRecord) => (
    <InspectionRecordCard
      isCurrent={currentInspectionRecordIds.has(record.id)}
      isMutationPending={isInspectionRecordMutationPending}
      key={record.id}
      locale={locale}
      onDelete={onDeleteInspectionRecord}
      record={record}
    />
  )

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={t('project.canvas.analysis')}
            className="min-w-[92px] justify-center"
            size="sm"
            type="button"
            variant="outline"
          />
        }
      >
        <ScanSearch data-icon="inline-start" />
        <span className="truncate">{t('project.canvas.analysis')}</span>
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
          <h3 className="text-xs font-medium text-foreground">{t('project.canvas.currentResults')}</h3>
          <span className="font-mono text-[10px] text-muted-foreground">{currentResultCount}</span>
        </div>

        <div className="flex max-h-72 min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
          {isLoading ? <p className="px-1 py-3 text-xs text-muted-foreground">{t('project.canvas.inspectionRecordsLoading')}</p> : null}
          {!isLoading && currentResultCount === 0 ? (
            <p className="px-1 py-3 text-xs leading-5 text-muted-foreground">
              {resultCount === 0 ? t('project.canvas.inspectionRecordsEmpty') : t('project.canvas.currentResultsEmpty')}
            </p>
          ) : null}

          {currentSectionArtifacts.map(renderSectionArtifact)}
          {currentInspectionRecords.map(renderInspectionRecord)}

          {historyCount > 0 ? (
            <>
              <Button
                aria-expanded={isHistoryExpanded}
                className="mx-1 mt-1 justify-between"
                onClick={() => setIsHistoryExpanded((expanded) => !expanded)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t('project.canvas.historyResults', { count: historyCount })}
                <ChevronDown className={isHistoryExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </Button>

              {isHistoryExpanded ? (
                <>
                  {visibleHistorySectionArtifacts.map(renderSectionArtifact)}
                  {visibleHistoryInspectionRecords.map(renderInspectionRecord)}

                  {!showAllHistory && historyCount > initialHistoryLimit ? (
                    <Button className="mx-1 mt-1" onClick={() => setShowAllHistory(true)} size="sm" type="button" variant="ghost">
                      {t('project.canvas.showAllHistory', { count: historyCount })}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function latestCurrentInspectionRecords(
  records: readonly ProjectInspectionRecord[],
  currentCADDocumentRevision: number | undefined,
  currentVisibleModelIds: readonly string[],
) {
  if (currentCADDocumentRevision === undefined) {
    return []
  }

  const latestRecordByCategory = new Map<string, ProjectInspectionRecord>()
  for (const record of records) {
    if (
      record.cad_document_revision !== currentCADDocumentRevision ||
      !equalStringSets(record.visible_model_ids, currentVisibleModelIds)
    ) {
      continue
    }
    const category = record.measurement?.derivation ?? `${record.kind}:${record.name}`
    const latestRecord = latestRecordByCategory.get(category)
    if (!latestRecord || Date.parse(record.created_at) > Date.parse(latestRecord.created_at)) {
      latestRecordByCategory.set(category, record)
    }
  }
  return [...latestRecordByCategory.values()]
}

function equalStringSets(first: readonly string[], second: readonly string[]) {
  if (first.length !== second.length) {
    return false
  }
  const secondValues = new Set(second)
  return first.every((value) => secondValues.has(value))
}
