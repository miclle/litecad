import { useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Box, Boxes, Check, Copy, Eye, EyeOff, FileText, Pencil, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { UpdateCADAssemblyOccurrencePayload } from 'src/types/project'
import type { ProjectModelTreeGroup } from './project-preview-assets'

type ProjectModelTreeProps = {
  groups: ProjectModelTreeGroup[]
  headerAction?: ReactNode
  hiddenModelIds: ReadonlySet<string>
  isLoading: boolean
  isUploading: boolean
	isOccurrenceMutationPending?: boolean
	onDeleteOccurrence?: (occurrenceId: string) => void
	onDuplicateOccurrence?: (occurrenceId: string) => void
	onMoveOccurrence?: (occurrenceId: string, targetIndex: number) => void
	onSelect: (modelId: string, nodeId: string, occurrenceId?: string) => void
  onToggleVisibility: (modelId: string) => void
  onUpdateOccurrence?: (occurrenceId: string, payload: UpdateCADAssemblyOccurrencePayload) => void
	occurrenceError?: string
  previewAssetModelIds: ReadonlySet<string>
  selectedNodeId: string
	selectedOccurrenceId?: string
  uploadError: string
}

export function ProjectModelTree({
  groups,
  headerAction,
  hiddenModelIds,
  isLoading,
  isUploading,
	isOccurrenceMutationPending = false,
	onDeleteOccurrence,
	onDuplicateOccurrence,
	onMoveOccurrence,
  onSelect,
  onToggleVisibility,
  onUpdateOccurrence,
	occurrenceError = '',
  previewAssetModelIds,
  selectedNodeId,
	selectedOccurrenceId = '',
  uploadError,
}: ProjectModelTreeProps) {
  const { t } = useTranslation()
	const assembly = groups[0]
	const [renamingOccurrenceID, setRenamingOccurrenceID] = useState('')
	const [occurrenceNameDraft, setOccurrenceNameDraft] = useState('')
	const commitOccurrenceName = (occurrenceID: string) => {
		const name = occurrenceNameDraft.trim()
		if (name) {
			onUpdateOccurrence?.(occurrenceID, { name })
		}
		setRenamingOccurrenceID('')
	}

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase text-[#64748b]">{t('project.modelTree.heading')}</p>
        {headerAction}
      </div>

      <div aria-label={t('project.modelTree.aria')} className="mt-3 grid gap-2" role="listbox">
        {isLoading ? <div className="px-2 py-2 font-mono text-[11px] uppercase text-[#64748b]">{t('project.modelTree.loading')}</div> : null}
        {!isLoading && groups.length === 0 ? (
          <div className="px-2 py-3 text-sm leading-6 text-[#64748b]">{t('project.modelTree.empty')}</div>
        ) : null}
		{assembly?.assemblyId ? (
			<div className="flex min-w-0 items-center gap-2 border-b border-[#e2e8f0] px-2 pb-2 text-sm text-[#0f172a]" data-testid="assembly-root">
				<Boxes className="size-4 shrink-0 text-[#334155]" />
				<span className="min-w-0 flex-1 truncate" title={assembly.assemblyName}>
					{assembly.assemblyName}
				</span>
				<span className="shrink-0 font-mono text-[10px] uppercase text-[#94a3b8]">
					{t('project.sidebar.modelCount', { count: groups.length })}
				</span>
			</div>
		) : null}
        {groups.map((group) => {
          const { model } = group
			const previewID = group.occurrenceId || model.id
			const isModelHidden = hiddenModelIds.has(previewID)
			const isSelectedOccurrence = !group.occurrenceId || selectedOccurrenceId === group.occurrenceId
			const isSelectedSourceNode = isSelectedOccurrence && selectedNodeId === group.sourceNodeId
			const hasPreviewAsset = previewAssetModelIds.has(previewID)
			const VisibilityIcon = isModelHidden ? EyeOff : Eye
			const canMoveUp = (group.occurrenceIndex ?? 0) > 0
			const canMoveDown = (group.occurrenceIndex ?? (group.assemblyOccurrenceCount ?? groups.length) - 1) < (group.assemblyOccurrenceCount ?? groups.length) - 1
			const canDeleteOccurrence = (group.modelOccurrenceCount ?? 1) > 1

          return (
			<div className={assembly?.assemblyId ? 'grid gap-1 pl-3' : 'grid gap-1'} key={group.occurrenceId || model.id}>
              <div
                className={`group/model-row min-w-0 rounded-md px-2 py-1.5 text-sm transition ${
                  isSelectedSourceNode
                    ? 'bg-[#eff6ff] text-[#0f172a] ring-1 ring-[#bfdbfe]'
                    : isModelHidden
                      ? 'text-[#94a3b8] hover:bg-[#f1f5f9]'
                      : 'text-[#1f2937] hover:bg-[#f1f5f9]'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    aria-selected={isSelectedSourceNode}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8]"
						onClick={() => onSelect(model.id, group.sourceNodeId, group.occurrenceId)}
                    role="option"
                    title={group.displayName}
                    type="button"
                  >
                    <FileText
                      className={`size-4 shrink-0 ${
                        isSelectedSourceNode ? 'text-[#1d4ed8]' : isModelHidden ? 'text-[#94a3b8]' : 'text-[#475569]'
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate">{group.displayName}</span>
                    {group.children.length > 0 ? (
                      <span className="shrink-0 font-mono text-[10px] uppercase text-[#94a3b8]">
                        {t('project.sidebar.modelCount', { count: group.children.length })}
                      </span>
                    ) : null}
                  </button>
                  {hasPreviewAsset ? (
                    <Button
                      aria-label={t(isModelHidden ? 'project.modelTree.show' : 'project.modelTree.hide', { name: group.displayName })}
                      aria-pressed={!isModelHidden}
                      className={`opacity-0 group-hover/model-row:opacity-100 focus-visible:opacity-100 ${isModelHidden ? 'opacity-100' : ''}`}
						onClick={() => onToggleVisibility(previewID)}
                      size="icon-xs"
                      title={t(isModelHidden ? 'project.modelTree.showModel' : 'project.modelTree.hideModel')}
                      type="button"
                      variant="ghost"
                    >
                      <VisibilityIcon />
                    </Button>
                  ) : null}
                  <div
                    aria-label={model.parse_status === 'parsed' ? t('project.modelTree.previewReady') : t('project.modelTree.processing')}
                    className={`size-1.5 shrink-0 rounded-full ${model.parse_status === 'parsed' ? 'bg-[#475569]' : 'bg-[#c9a66b]'}`}
                  />
                </div>
              </div>
				{isSelectedOccurrence && group.occurrenceId ? (
					<div className="mt-1 flex min-w-0 items-center gap-1 border-t border-[#dbeafe] pt-1">
						{renamingOccurrenceID === group.occurrenceId ? (
							<>
								<Input
									aria-label={t('project.modelTree.occurrenceName')}
									className="h-7 min-w-0 flex-1 px-2 text-xs"
									autoFocus
									onChange={(event) => setOccurrenceNameDraft(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === 'Enter') commitOccurrenceName(group.occurrenceId)
										if (event.key === 'Escape') setRenamingOccurrenceID('')
									}}
									value={occurrenceNameDraft}
								/>
								<Button aria-label={t('project.modelTree.saveOccurrenceName')} onClick={() => commitOccurrenceName(group.occurrenceId)} size="icon-xs" type="button" variant="ghost"><Check /></Button>
								<Button aria-label={t('project.modelTree.cancelOccurrenceName')} onClick={() => setRenamingOccurrenceID('')} size="icon-xs" type="button" variant="ghost"><X /></Button>
							</>
						) : (
							<>
								<Button aria-label={t('project.modelTree.duplicateOccurrence')} disabled={isOccurrenceMutationPending} onClick={() => onDuplicateOccurrence?.(group.occurrenceId)} size="icon-xs" title={t('project.modelTree.duplicateOccurrence')} type="button" variant="ghost"><Copy /></Button>
								<Button aria-label={t('project.modelTree.renameOccurrence')} disabled={isOccurrenceMutationPending} onClick={() => { setOccurrenceNameDraft(group.occurrenceName || group.displayName); setRenamingOccurrenceID(group.occurrenceId) }} size="icon-xs" title={t('project.modelTree.renameOccurrence')} type="button" variant="ghost"><Pencil /></Button>
								<Button aria-label={t('project.modelTree.moveOccurrenceUp')} disabled={!canMoveUp || isOccurrenceMutationPending} onClick={() => onMoveOccurrence?.(group.occurrenceId, (group.occurrenceIndex ?? 0) - 1)} size="icon-xs" title={t('project.modelTree.moveOccurrenceUp')} type="button" variant="ghost"><ArrowUp /></Button>
								<Button aria-label={t('project.modelTree.moveOccurrenceDown')} disabled={!canMoveDown || isOccurrenceMutationPending} onClick={() => onMoveOccurrence?.(group.occurrenceId, (group.occurrenceIndex ?? 0) + 1)} size="icon-xs" title={t('project.modelTree.moveOccurrenceDown')} type="button" variant="ghost"><ArrowDown /></Button>
								<Button aria-label={t(group.suppressed ? 'project.modelTree.unsuppressOccurrence' : 'project.modelTree.suppressOccurrence')} aria-pressed={Boolean(group.suppressed)} disabled={isOccurrenceMutationPending} onClick={() => onUpdateOccurrence?.(group.occurrenceId, { suppressed: !group.suppressed })} size="icon-xs" title={t(group.suppressed ? 'project.modelTree.unsuppressOccurrence' : 'project.modelTree.suppressOccurrence')} type="button" variant="ghost">{group.suppressed ? <Eye /> : <EyeOff />}</Button>
								<span className="flex-1" />
								<Button aria-label={t('project.modelTree.deleteOccurrence')} disabled={!canDeleteOccurrence || isOccurrenceMutationPending} onClick={() => onDeleteOccurrence?.(group.occurrenceId)} size="icon-xs" title={canDeleteOccurrence ? t('project.modelTree.deleteOccurrence') : t('project.modelTree.keepLastOccurrence')} type="button" variant="ghost"><Trash2 /></Button>
							</>
						)}
					</div>
				) : null}
              {group.children.length > 0 ? (
                <div className="grid gap-1 pl-5">
                  {group.children.map((child) => {
							const isSelectedChild = isSelectedOccurrence && selectedNodeId === child.id
                    return (
                      <button
                        aria-selected={isSelectedChild}
                        className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#94a3b8] ${
                          isSelectedChild
                            ? 'bg-[#eff6ff] text-[#0f172a] ring-1 ring-[#bfdbfe]'
                            : isModelHidden
                              ? 'text-[#94a3b8] hover:bg-[#f1f5f9]'
                              : 'text-[#334155] hover:bg-[#f1f5f9]'
                        }`}
                        key={child.id}
							onClick={() => onSelect(child.sourceModelId || model.id, child.id, group.occurrenceId)}
                        role="option"
                        title={child.name}
                        type="button"
                      >
                        <Box className={`size-3.5 shrink-0 ${isSelectedChild ? 'text-[#1d4ed8]' : isModelHidden ? 'text-[#94a3b8]' : 'text-[#64748b]'}`} />
                        <span className="min-w-0 flex-1 truncate">{child.name}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
        {isUploading ? (
          <div className="rounded-md border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-3 font-mono text-[11px] uppercase text-[#475569]">
            {t('project.modelTree.importing')}
          </div>
        ) : null}
        {uploadError ? <p className="text-sm leading-6 text-[#8a2f24]">{uploadError}</p> : null}
				{occurrenceError ? <p className="text-sm leading-6 text-[#8a2f24]">{occurrenceError}</p> : null}
      </div>
    </section>
  )
}
