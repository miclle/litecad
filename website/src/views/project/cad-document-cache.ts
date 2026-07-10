import type { ProjectCADDocument } from 'src/types/project'

export function shouldAcceptCADNodeTransformDocument(currentDocument: ProjectCADDocument | undefined, nodeId: string) {
  return !currentDocument || currentDocument.nodes.some((node) => node.id === nodeId)
}
