import { Download, FileText } from 'lucide-react'
import { useState } from 'react'

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
import type { StepExportMode, StepExportTarget } from './project-step-export'

type ProjectStepExportPopoverProps = {
  disabled: boolean
  onExport: (mode: StepExportMode) => Promise<unknown>
  onOpenChange: (open: boolean) => void
  onSelectAll: () => void
  onToggleTarget: (modelId: string) => void
  open: boolean
  selectedTargetIds: ReadonlySet<string>
  targets: readonly StepExportTarget[]
}

export function ProjectStepExportPopover({
  disabled,
  onExport,
  onOpenChange,
  onSelectAll,
  onToggleTarget,
  open,
  selectedTargetIds,
  targets,
}: ProjectStepExportPopoverProps) {
  const [error, setError] = useState('')
  const [isPending, setIsPending] = useState(false)
  const selectedCount = targets.filter((target) => selectedTargetIds.has(target.modelId)).length

  const exportSelection = async (mode: StepExportMode) => {
    setError('')
    setIsPending(true)
    try {
      await onExport(mode)
      onOpenChange(false)
    } catch {
      setError('STEP export failed')
      onOpenChange(true)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  aria-label="Export STEP"
                  className="border-transparent text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                  disabled={disabled}
                  size="icon-lg"
                  type="button"
                  variant="ghost"
                />
              }
            >
              <Download />
            </PopoverTrigger>
          }
        />
        <TooltipContent sideOffset={8}>Export STEP</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        aria-label="Export STEP options"
        className="relative w-[min(420px,calc(100vw-24px))] gap-0 rounded-md border-[#e2e8f0] bg-white/96 p-2 text-left shadow-[0_16px_42px_rgba(15,23,42,0.12)] backdrop-blur"
        sideOffset={10}
      >
        <PopoverArrow className="border-[#e2e8f0] bg-white/96" />
        <PopoverHeader className="px-2 py-2">
          <PopoverTitle className="font-mono text-[11px] uppercase text-[#64748b]">Export STEP</PopoverTitle>
          <PopoverDescription className="text-xs leading-5 text-[#64748b]">
            Select current document models, then choose a download action.
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-1 border-t border-[#e2e8f0] px-2 pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] uppercase text-[#64748b]">
              {selectedCount}/{targets.length} selected
            </span>
            <Button disabled={isPending || targets.length === 0} onClick={onSelectAll} size="xs" type="button" variant="ghost">
              Select all
            </Button>
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto pr-1">
            {targets.map((target) => (
              <label
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-sm text-[#1f2937] transition hover:bg-[#f1f5f9]"
                key={target.modelId}
                title={target.downloadFilename}
              >
                <input
                  checked={selectedTargetIds.has(target.modelId)}
                  className="size-4 accent-[#0f172a]"
                  disabled={isPending}
                  onChange={() => onToggleTarget(target.modelId)}
                  type="checkbox"
                />
                <FileText className="size-4 shrink-0 text-[#64748b]" />
                <span className="min-w-0 flex-1 truncate">{target.displayName}</span>
              </label>
            ))}
          </div>
          {error ? <p className="mt-2 text-xs leading-5 text-[#8a2f24]">{error}</p> : null}
          <div className="my-1 h-px bg-[#e2e8f0]" />
          <div className="grid grid-cols-2 gap-1.5">
            <Button disabled={isPending || selectedCount === 0} onClick={() => exportSelection('merged')} size="sm" type="button">
              <Download data-icon="inline-start" />
              <span className="truncate">{isPending ? 'Exporting' : 'Merged STEP'}</span>
            </Button>
            <Button
              disabled={isPending || selectedCount === 0}
              onClick={() => exportSelection('separate')}
              size="sm"
              type="button"
              variant="outline"
            >
              <Download data-icon="inline-start" />
              <span className="truncate">{isPending ? 'Exporting' : 'Separate files'}</span>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
