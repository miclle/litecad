import { History, Redo2, Undo2 } from 'lucide-react'

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
import type { CADHistoryEntry } from 'src/types/project'
import { cadHistoryStatusLabel } from './cad-document-history'

type ProjectHistoryPopoverProps = {
  canRedo: boolean
  canUndo: boolean
  entries: CADHistoryEntry[]
  error: string
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isLoading: boolean
  isMutationPending: boolean
  loadError: boolean
  onFetchNextPage: () => void
  onHistoryAction: (action: 'undo' | 'redo') => void
  onOpenChange: (open: boolean) => void
  open: boolean
}

function HistoryAction({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean
  icon: 'redo' | 'undo'
  label: string
  onClick: () => void
}) {
  const Icon = icon === 'undo' ? Undo2 : Redo2
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button aria-label={label} disabled={disabled} onClick={onClick} size="icon-sm" type="button" variant="ghost" />}
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ProjectHistoryPopover({
  canRedo,
  canUndo,
  entries,
  error,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  isMutationPending,
  loadError,
  onFetchNextPage,
  onHistoryAction,
  onOpenChange,
  open,
}: ProjectHistoryPopoverProps) {
  return (
    <div className="flex items-center rounded-md border border-[#e2e8f0] bg-white/70 p-0.5">
      <HistoryAction
        disabled={isMutationPending || !canUndo}
        icon="undo"
        label="Undo"
        onClick={() => onHistoryAction('undo')}
      />
      <HistoryAction
        disabled={isMutationPending || !canRedo}
        icon="redo"
        label="Redo"
        onClick={() => onHistoryAction('redo')}
      />
      <Popover onOpenChange={onOpenChange} open={open}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger render={<Button aria-label="Operation history" size="icon-sm" type="button" variant="ghost" />}>
                <History />
              </PopoverTrigger>
            }
          />
          <TooltipContent sideOffset={8}>Operation history</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          aria-label="Operation history"
          className="relative w-[min(380px,calc(100vw-24px))] gap-0 rounded-md border-[#e2e8f0] bg-white/96 p-2 text-left shadow-[0_16px_42px_rgba(15,23,42,0.12)] backdrop-blur"
          sideOffset={10}
        >
          <PopoverArrow className="border-[#e2e8f0] bg-white/96" />
          <PopoverHeader className="px-2 py-2">
            <PopoverTitle className="font-mono text-[11px] uppercase text-[#64748b]">Operation history</PopoverTitle>
            <PopoverDescription className="text-xs leading-5 text-[#64748b]">
              Saved with this project and available on every signed-in device.
            </PopoverDescription>
          </PopoverHeader>
          {error ? <p className="mx-2 border-t border-[#e2e8f0] py-3 text-xs leading-5 text-[#8a2f24]">{error}</p> : null}
          <div className="max-h-72 overflow-y-auto border-t border-[#e2e8f0] py-1">
            {isLoading ? <p className="px-2 py-4 text-xs text-[#64748b]">Loading history…</p> : null}
            {loadError ? <p className="px-2 py-4 text-xs text-[#8a2f24]">Could not load operation history.</p> : null}
            {!isLoading && !loadError && entries.length === 0 ? (
              <p className="px-2 py-4 text-xs leading-5 text-[#64748b]">Edits will appear here after you move, change parameters, add, or delete model content.</p>
            ) : null}
            {entries.map((entry) => (
              <div className="flex items-start gap-3 rounded px-2 py-2.5 hover:bg-[#f8fafc]" key={entry.id}>
                <span className="mt-0.5 min-w-8 font-mono text-[10px] text-[#94a3b8]">#{entry.sequence}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[#1f2937]" title={entry.summary}>
                    {entry.summary}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-3 font-mono text-[10px] uppercase text-[#64748b]">
                    <span>{cadHistoryStatusLabel(entry.status)}</span>
                    <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
                  </div>
                </div>
              </div>
            ))}
            {hasNextPage ? (
              <Button
                className="mx-2 my-2 w-[calc(100%-16px)]"
                disabled={isFetchingNextPage || isMutationPending}
                onClick={onFetchNextPage}
                size="sm"
                type="button"
                variant="outline"
              >
                {isFetchingNextPage ? 'Loading…' : 'Load older operations'}
              </Button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
