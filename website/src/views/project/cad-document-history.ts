export type CADHistoryAction = 'undo' | 'redo'

export function cadHistoryActionForKey(event: KeyboardEvent): CADHistoryAction | undefined {
  if (event.key.toLowerCase() !== 'z' || event.altKey || (!event.metaKey && !event.ctrlKey) || isEditableTarget(event.target)) {
    return undefined
  }
  return event.shiftKey ? 'redo' : 'undo'
}

export function cadHistoryStatusLabelKey(status: string) {
  if (status === 'applied') {
    return 'project.history.status.applied'
  }
  if (status === 'undone') {
    return 'project.history.status.undone'
  }
  if (status === 'discarded') {
    return 'project.history.status.discarded'
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
