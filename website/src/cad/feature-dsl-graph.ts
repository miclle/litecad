import type {
  CadKernelFeatureDSLBooleanFeature,
  CadKernelFeatureDSLDocument,
  CadKernelFeatureDSLFeature,
} from './kernel-protocol'

export type FeatureDSLGraphNode = {
  id: string
  type: string
  parentID: string
  index: number
  depth: number
  path: string
  feature: CadKernelFeatureDSLFeature
}

export function flattenFeatureDSLGraph(document: CadKernelFeatureDSLDocument): FeatureDSLGraphNode[] {
  const nodes: FeatureDSLGraphNode[] = []
  const seen = new Set<string>()

  const appendNodes = (
    features: readonly CadKernelFeatureDSLFeature[],
    parentID: string,
    parentPath: string,
    depth: number,
  ) => {
    for (const [index, feature] of features.entries()) {
      const id = feature.id.trim()
      if (!id) {
        throw new Error('Feature graph node ID is required')
      }
      if (seen.has(id)) {
        throw new Error(`Duplicate Feature graph node ID: ${id}`)
      }
      seen.add(id)
      const pathSegment = featureDSLGraphPathSegment(id)
      const path = parentPath ? `${parentPath}/operands/${pathSegment}` : `features/${pathSegment}`
      nodes.push({ id, type: feature.type, parentID, index, depth, path, feature })
      if (feature.type === 'boolean') {
        appendNodes(feature.operands, id, path, depth + 1)
      }
    }
  }

  appendNodes(document.features, '', '', 0)
  return nodes
}

export function featureDSLGraphNodeLocalValue(node: FeatureDSLGraphNode): Record<string, unknown> {
  const localValue = { ...node.feature } as Record<string, unknown>
  delete localValue.operands
  return localValue
}

export function replaceFeatureDSLGraphNode(
  document: CadKernelFeatureDSLDocument,
  nodeID: string,
  nodeLocalValue: Record<string, unknown>,
): CadKernelFeatureDSLDocument {
  if (nodeLocalValue.id !== nodeID) {
    throw new Error(`Feature graph node ID must remain ${nodeID}`)
  }
  if (typeof nodeLocalValue.type !== 'string' || nodeLocalValue.type.trim() === '') {
    throw new Error('Feature graph node type is required')
  }

  let found = false
  const replaceNodes = (features: readonly CadKernelFeatureDSLFeature[]): CadKernelFeatureDSLFeature[] =>
    features.map((feature) => {
      if (feature.id === nodeID) {
        found = true
        const replacement = { ...nodeLocalValue }
        delete replacement.operands
        if (feature.type === 'boolean' && replacement.type === 'boolean') {
          replacement.operands = feature.operands
        }
        return replacement as CadKernelFeatureDSLFeature
      }
      if (feature.type !== 'boolean') {
        return feature
      }
      const operands = replaceNodes(feature.operands)
      return operands.some((operand, index) => operand !== feature.operands[index])
        ? ({ ...feature, operands } as CadKernelFeatureDSLBooleanFeature)
        : feature
    })

  const features = replaceNodes(document.features)
  if (!found) {
    throw new Error(`Feature graph node not found: ${nodeID}`)
  }
  return { ...document, features }
}

function featureDSLGraphPathSegment(id: string) {
  return id.replaceAll('~', '~0').replaceAll('/', '~1')
}
