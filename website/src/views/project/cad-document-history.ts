export type CADHistoryAction = 'undo' | 'redo'

export function cadHistoryActionForKey(event: KeyboardEvent): CADHistoryAction | undefined {
  if (event.key.toLowerCase() !== 'z' || event.altKey || (!event.metaKey && !event.ctrlKey) || isEditableTarget(event.target)) {
    return undefined
  }
  return event.shiftKey ? 'redo' : 'undo'
}

export function cadHistoryStatusLabel(status: string) {
  if (status === 'applied') {
    return 'Applied'
  }
  if (status === 'undone') {
    return 'Undone'
  }
  if (status === 'discarded') {
    return 'Alternate path'
  }
  return status
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && (target.isContentEditable || target.closest('[contenteditable="true"]') !== null))
  )
}
