export type CADNodeDeleteKey = {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  isComposing: boolean
  target: unknown
}

type EditableKeyTarget = {
  tagName?: unknown
  isContentEditable?: unknown
}

export function shouldDeleteSelectedCADNodeFromKey(event: CADNodeDeleteKey) {
  if (
    (event.key !== 'Delete' && event.key !== 'Backspace') ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.isComposing
  ) {
    return false
  }

  const target = event.target as EditableKeyTarget | null
  const tagName = typeof target?.tagName === 'string' ? target.tagName.toUpperCase() : ''
  return target?.isContentEditable !== true && tagName !== 'INPUT' && tagName !== 'TEXTAREA' && tagName !== 'SELECT'
}
