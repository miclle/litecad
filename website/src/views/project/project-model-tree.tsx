import type { ReactNode } from 'react'
import { Box, Boxes, Eye, EyeOff, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { ProjectModelTreeGroup } from './project-preview-assets'

type ProjectModelTreeProps = {
  groups: ProjectModelTreeGroup[]
  headerAction?: ReactNode
  hiddenModelIds: ReadonlySet<string>
  isLoading: boolean
  isUploading: boolean
  onSelect: (modelId: string, nodeId: string) => void
  onToggleVisibility: (modelId: string) => void
  previewAssetModelIds: ReadonlySet<string>
  selectedNodeId: string
  uploadError: string
}

export function ProjectModelTree({
  groups,
  headerAction,
  hiddenModelIds,
  isLoading,
  isUploading,
  onSelect,
  onToggleVisibility,
  previewAssetModelIds,
  selectedNodeId,
  uploadError,
}: ProjectModelTreeProps) {
  const { t } = useTranslation()
	const assembly = groups[0]

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
          const isModelHidden = hiddenModelIds.has(model.id)
          const isSelectedSourceNode = selectedNodeId === group.sourceNodeId
          const hasPreviewAsset = previewAssetModelIds.has(model.id)
          const VisibilityIcon = isModelHidden ? EyeOff : Eye

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
                    onClick={() => onSelect(model.id, group.sourceNodeId)}
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
                      onClick={() => onToggleVisibility(model.id)}
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
              {group.children.length > 0 ? (
                <div className="grid gap-1 pl-5">
                  {group.children.map((child) => {
                    const isSelectedChild = selectedNodeId === child.id
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
                        onClick={() => onSelect(child.sourceModelId || model.id, child.id)}
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
      </div>
    </section>
  )
}
