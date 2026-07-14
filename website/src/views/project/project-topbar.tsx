import type { ChangeEventHandler, ReactElement, ReactNode, RefObject } from 'react'
import { ArrowLeft, BotMessageSquare, CheckCircle2, Info, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { CADHistoryEntry, Project } from 'src/types/project'
import { ProjectHistoryPopover } from './project-history-popover'
import { ProjectStepExportPopover } from './project-step-export-popover'
import type { StepExportMode, StepExportTarget } from './project-step-export'

// ProjectTopbarDocumentDetail is one project info popover metadata row.
export type ProjectTopbarDocumentDetail = {
  label: string
  value: ReactNode
}

// ProjectTopbarPreviewSummary is the preview status shown in the project info popover.
export type ProjectTopbarPreviewSummary = {
  sourceBody: string
  sourceLabel: string
}

type ProjectTopbarProps = {
  canRedo: boolean
  canUndo: boolean
  documentDetails: ProjectTopbarDocumentDetail[]
  fileInputRef: RefObject<HTMLInputElement | null>
  historyEntries: CADHistoryEntry[]
  historyError: string
  hasNextHistoryPage: boolean
  isAiChatOpen: boolean
  isHistoryFetchingNextPage: boolean
  isHistoryLoading: boolean
  isHistoryLoadError: boolean
  isHistoryMutationPending: boolean
  isHistoryOpen: boolean
  isProjectInfoOpen: boolean
  isStepExportOpen: boolean
  isUploading: boolean
  onFetchNextHistoryPage: () => void
  onHistoryAction: (action: 'undo' | 'redo') => void
  onHistoryOpenChange: (open: boolean) => void
  onModelFileChange: ChangeEventHandler<HTMLInputElement>
  onProjectInfoOpenChange: (open: boolean) => void
  onStepExport: (mode: StepExportMode) => Promise<unknown>
  onStepExportOpenChange: (open: boolean) => void
  onStepExportSelectAll: () => void
  onStepExportToggleTarget: (modelId: string) => void
  onToggleAiChat: () => void
  previewSummary: ProjectTopbarPreviewSummary
  project: Project
  projectDescription: string
  selectedStepExportTargetIds: ReadonlySet<string>
  stepExportDisabled: boolean
  stepExportTargets: readonly StepExportTarget[]
}

function TopbarTooltip({
  label,
  render,
  children,
}: {
  label: string
  render: ReactElement
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={render}>{children}</TooltipTrigger>
      <TooltipContent sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  )
}

// ProjectTopbar renders the controlled project workbench topbar without owning route data.
export function ProjectTopbar({
  canRedo,
  canUndo,
  documentDetails,
  fileInputRef,
  historyEntries,
  historyError,
  hasNextHistoryPage,
  isAiChatOpen,
  isHistoryFetchingNextPage,
  isHistoryLoading,
  isHistoryLoadError,
  isHistoryMutationPending,
  isHistoryOpen,
  isProjectInfoOpen,
  isStepExportOpen,
  isUploading,
  onFetchNextHistoryPage,
  onHistoryAction,
  onHistoryOpenChange,
  onModelFileChange,
  onProjectInfoOpenChange,
  onStepExport,
  onStepExportOpenChange,
  onStepExportSelectAll,
  onStepExportToggleTarget,
  onToggleAiChat,
  previewSummary,
  project,
  projectDescription,
  selectedStepExportTargetIds,
  stepExportDisabled,
  stepExportTargets,
}: ProjectTopbarProps) {
  const { t } = useTranslation()

  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <TopbarTooltip
          label={t('project.route.allProjects')}
          render={
            <Link
              aria-label={t('project.route.allProjects')}
              className="grid size-9 shrink-0 place-items-center rounded-md text-[#64748b] no-underline transition hover:bg-[#f1f5f9] hover:text-[#0f172a]"
              to="/projects"
            />
          }
        >
          <ArrowLeft className="size-4" />
        </TopbarTooltip>
        <div className="relative flex min-w-0 items-center gap-1.5">
          <h1 className="truncate text-sm font-semibold leading-tight text-[#0f172a]">{project.name}</h1>
          <Popover onOpenChange={onProjectInfoOpenChange} open={isProjectInfoOpen}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <Button
                        aria-label={t('project.topbar.projectInfo')}
                        className="shrink-0"
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <Info />
                  </PopoverTrigger>
                }
              />
              <TooltipContent sideOffset={8}>{t('project.topbar.projectInfo')}</TooltipContent>
            </Tooltip>
            <PopoverContent
              align="center"
              aria-label={t('project.topbar.projectInfo')}
              className="relative w-[min(360px,calc(100vw-24px))] gap-0 rounded-md border-[#e2e8f0] bg-white/96 p-4 text-left shadow-[0_16px_42px_rgba(15,23,42,0.12)] backdrop-blur"
              sideOffset={10}
            >
              <PopoverArrow className="border-[#e2e8f0] bg-white/96" />
              <PopoverHeader className="flex-row items-center justify-between gap-3">
                <PopoverTitle className="font-mono text-[11px] uppercase text-[#64748b]">{t('project.topbar.project')}</PopoverTitle>
                <PopoverDescription className="truncate text-sm font-semibold text-[#0f172a]">
                  {project.name}
                </PopoverDescription>
              </PopoverHeader>

              <section className="mt-4">
                <p className="font-mono text-[11px] uppercase text-[#64748b]">{t('project.topbar.description')}</p>
                <p className="mt-2 text-sm leading-6 text-[#1f2937]">{projectDescription}</p>
              </section>

              <section className="mt-4 rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
                  <CheckCircle2 className="size-4 text-[#475569]" />
                  {previewSummary.sourceLabel}
                </div>
                <p className="mt-2 text-sm leading-6 text-[#64748b]">{previewSummary.sourceBody}</p>
              </section>

              <section className="mt-4">
                <p className="font-mono text-[11px] uppercase text-[#64748b]">{t('project.topbar.document')}</p>
                <dl className="mt-3 grid gap-2 text-sm">
                  {documentDetails.map((detail) => (
                    <div className="flex items-center justify-between gap-4 border-b border-[#e2e8f0] pb-2" key={detail.label}>
                      <dt className="text-[#64748b]">{detail.label}</dt>
                      <dd className="truncate text-[#1f2937]">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="hidden items-center justify-end gap-1.5 lg:flex">
        <ProjectHistoryPopover
          canRedo={canRedo}
          canUndo={canUndo}
          entries={historyEntries}
          error={historyError}
          hasNextPage={hasNextHistoryPage}
          isFetchingNextPage={isHistoryFetchingNextPage}
          isLoading={isHistoryLoading}
          isMutationPending={isHistoryMutationPending}
          loadError={isHistoryLoadError}
          onFetchNextPage={onFetchNextHistoryPage}
          onHistoryAction={onHistoryAction}
          onOpenChange={onHistoryOpenChange}
          open={isHistoryOpen}
        />
        <ProjectStepExportPopover
          disabled={stepExportDisabled}
          onExport={onStepExport}
          onOpenChange={onStepExportOpenChange}
          onSelectAll={onStepExportSelectAll}
          onToggleTarget={onStepExportToggleTarget}
          open={isStepExportOpen}
          selectedTargetIds={selectedStepExportTargetIds}
          targets={stepExportTargets}
        />
        <TopbarTooltip
          label={t('project.topbar.importModel')}
          render={
            <button
              aria-label={t('project.topbar.importModel')}
              className="grid size-9 place-items-center rounded-md text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            />
          }
        >
          <Upload className="size-4" />
        </TopbarTooltip>
        <button
          aria-label={t('project.topbar.toggleAssistant')}
          aria-pressed={isAiChatOpen}
          className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
            isAiChatOpen
              ? 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]'
              : 'border-transparent text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]'
          }`}
          onClick={onToggleAiChat}
          title={isAiChatOpen ? t('project.topbar.closeAssistant') : t('project.topbar.openAssistant')}
          type="button"
        >
          <BotMessageSquare className="size-4" />
          {t('project.topbar.assistant')}
        </button>
        <input
          accept=".step,.stp,.gltf,.glb,.stl"
          className="hidden"
          onChange={onModelFileChange}
          ref={fileInputRef}
          type="file"
        />
      </div>
    </>
  )
}
