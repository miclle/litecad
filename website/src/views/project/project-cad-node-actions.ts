import type { CADDocumentNode } from 'src/types/project'

export function isCADDocumentNodeDeletable(node?: Pick<CADDocumentNode, 'source_format'>) {
  return Boolean(node?.source_format)
}
