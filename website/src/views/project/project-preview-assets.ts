import type { CADTransform, ProjectCADDocument, ProjectModel, ProjectModelPreviewArtifact } from 'src/types/project'
import type { CadKernelMesh, CadKernelMeshSummary, CadKernelOperation } from 'src/cad/kernel-protocol'

export type ProjectPreviewUrlAsset = {
  modelId: string
  name: string
  previewFormat: ProjectModelPreviewArtifact['format']
  previewUrl: string
  transform?: CADTransform
}

export type ProjectPreviewKernelMeshAsset = {
  modelId: string
  name: string
  previewFormat: 'kernel-mesh'
  mesh: CadKernelMesh
  componentMeshes?: CadKernelMesh[]
  meshSummary: CadKernelMeshSummary
  geometrySignature?: string
  pickTargets?: { modelId: string; nodeId: string; name: string }[]
  transform?: undefined
}

export type ProjectPreviewAsset = ProjectPreviewUrlAsset | ProjectPreviewKernelMeshAsset

export type ProjectPreviewSummaryInput = {
  modelCount: number
  previewAssetCount: number
  latestPreviewFormat?: string
}

export type ProjectModelTreeGroup = {
  model: ProjectModel
  sourceNodeId: string
  displayName: string
  children: { id: string; name: string; sourceModelId: string }[]
}

type ProjectPreviewPickTarget = { modelId: string; nodeId: string; name: string; componentIndex?: number }

export function parsedPreviewModels(models: ProjectModel[]) {
  return models.filter((model) => model.parse_status === 'parsed')
}

export function buildProjectModelTree(models: ProjectModel[], cadDocument?: ProjectCADDocument): ProjectModelTreeGroup[] {
  const sourceModelIDByNodeID = buildSourceModelIDByNodeID(cadDocument)
  const componentNodesByParentID = new Map<string, { id: string; name: string; sourceModelId: string }[]>()
  for (const node of cadDocument?.nodes ?? []) {
    if (node.source_format !== 'step-component' || !node.parent_node_id || !node.name.trim()) {
      continue
    }
    const nodes = componentNodesByParentID.get(node.parent_node_id) ?? []
    nodes.push({ id: node.id, name: node.name.trim(), sourceModelId: node.source_model_id || sourceModelIDByNodeID.get(node.parent_node_id) || node.model_id })
    componentNodesByParentID.set(node.parent_node_id, nodes)
  }

  return models.map((model) => {
    const parentNodeID = `node_${model.id}`
    const documentChildren = componentNodesByParentID.get(parentNodeID) ?? []
    const metadataChildren =
      documentChildren.length > 0
        ? documentChildren
        : (model.metadata.components ?? [])
            .map((component, index) => ({ id: `node_${model.id}_component_${index + 1}`, name: component.name.trim(), sourceModelId: model.id }))
            .filter((component) => component.name !== '')

    return {
      model,
      sourceNodeId: parentNodeID,
      displayName: metadataChildren.length > 1 ? getSourceDisplayName(model) : getModelDisplayName(model),
      children: metadataChildren.length > 1 ? metadataChildren : [],
    }
  })
}

export function buildProjectPreviewAssets(
  models: ProjectModel[],
  previewArtifacts: ProjectModelPreviewArtifact[],
  previewUrlsByModelID: Record<string, string>,
  kernelMeshesByModelID: Record<string, { mesh: CadKernelMesh; componentMeshes?: CadKernelMesh[]; meshSummary: CadKernelMeshSummary }> = {},
  cadDocument?: ProjectCADDocument,
) {
  const artifactByModelID = new Map(previewArtifacts.map((artifact) => [artifact.model_id, artifact]))
  const transformByModelID = new Map((cadDocument?.nodes ?? []).map((node) => [node.model_id, node.transform]))
  const sourceModelIDByNodeID = buildSourceModelIDByNodeID(cadDocument)
  const componentNodesBySourceModelID = new Map<string, ProjectPreviewPickTarget[]>()
  for (const node of cadDocument?.nodes ?? []) {
    if (node.source_format !== 'step-component' || !node.name.trim()) {
      continue
    }
    const sourceModelID = node.source_model_id || sourceModelIDByNodeID.get(node.parent_node_id) || ''
    if (!sourceModelID) {
      continue
    }
    const nodes = componentNodesBySourceModelID.get(sourceModelID) ?? []
    nodes.push({ modelId: sourceModelID, nodeId: node.id, name: node.name.trim(), componentIndex: componentIndexFromNodeID(node.id) })
    componentNodesBySourceModelID.set(sourceModelID, nodes)
  }

  return models.flatMap((model): ProjectPreviewAsset[] => {
    const kernelMesh = model.format === 'step' ? kernelMeshesByModelID[model.id] : undefined
    const transform = transformByModelID.get(model.id)
    if (kernelMesh) {
      const geometrySignature = cadKernelGeometryOperationSignature(cadDocument, model.id)
      const pickTargetsWithIndex =
        componentNodesBySourceModelID.get(model.id) ??
        (model.metadata.components ?? [])
          .map((component, index) => ({
            modelId: model.id,
            nodeId: `node_${model.id}_component_${index + 1}`,
            name: component.name.trim(),
            componentIndex: index,
          }))
          .filter((component) => component.name !== '')
      const filteredComponentMeshes =
        kernelMesh.componentMeshes && pickTargetsWithIndex.length > 0
          ? pickTargetsWithIndex
              .map((target) => (target.componentIndex === undefined ? undefined : kernelMesh.componentMeshes?.[target.componentIndex]))
              .filter((mesh): mesh is CadKernelMesh => Boolean(mesh))
          : undefined
      const pickTargets = pickTargetsWithIndex.map(({ componentIndex: _componentIndex, ...target }) => target)
      return [
        {
          modelId: model.id,
          name: getModelDisplayName(model),
          previewFormat: 'kernel-mesh',
          mesh: kernelMesh.mesh,
          meshSummary: kernelMesh.meshSummary,
          ...(geometrySignature ? { geometrySignature } : {}),
          ...(pickTargets.length > 1 || filteredComponentMeshes?.length ? { pickTargets } : {}),
          ...(filteredComponentMeshes?.length ? { componentMeshes: filteredComponentMeshes } : kernelMesh.componentMeshes ? {} : {}),
        },
      ]
    }

    const artifact = artifactByModelID.get(model.id)
    const previewUrl = previewUrlsByModelID[model.id]
    if (!artifact || !previewUrl) {
      return []
    }
    return [
      {
        modelId: model.id,
        name: getModelDisplayName(model),
        previewFormat: artifact.format,
        previewUrl,
        transform,
      },
    ]
  })
}

function buildSourceModelIDByNodeID(cadDocument: ProjectCADDocument | undefined) {
  return new Map((cadDocument?.nodes ?? []).map((node) => [node.id, node.source_model_id || node.model_id] as const))
}

function componentIndexFromNodeID(nodeID: string) {
  const match = nodeID.match(/_component_(\d+)$/)
  if (!match) {
    return undefined
  }
  const componentNumber = Number(match[1])
  return Number.isInteger(componentNumber) && componentNumber > 0 ? componentNumber - 1 : undefined
}

export function projectPreviewAssetSignature(assets: readonly ProjectPreviewAsset[]) {
  return assets
    .map((asset) => {
      if (asset.previewFormat === 'kernel-mesh') {
        const geometrySignature = asset.geometrySignature ? `:${asset.geometrySignature}` : ''
        const componentMeshSignature = asset.componentMeshes?.length
          ? `:${asset.componentMeshes.map((mesh) => `${mesh.positions.length}/${mesh.normals.length}/${mesh.indices.length}`).join(',')}`
          : ''
        const pickTargetSignature = asset.pickTargets
          ? `:${asset.pickTargets.map((target) => `${target.modelId}/${target.nodeId}/${target.name}`).join(',')}`
          : ''
        return `${asset.modelId}:${asset.previewFormat}:${asset.mesh.positions.length}:${asset.mesh.normals.length}:${asset.mesh.indices.length}${geometrySignature}${componentMeshSignature}${pickTargetSignature}`
      }
      return `${asset.modelId}:${asset.previewFormat}:${asset.previewUrl}`
    })
    .join('|')
}

export function cadKernelGeometryOperationsForModel(cadDocument: ProjectCADDocument | undefined, modelId: string): CadKernelOperation[] {
  return cadKernelOperationsForModel(cadDocument, modelId).filter((operation) => operation.type !== 'transform')
}

export function cadKernelGeometryOperationSignature(cadDocument: ProjectCADDocument | undefined, modelId: string) {
  return cadKernelGeometryOperationsForModel(cadDocument, modelId)
    .map((operation) => {
      if (operation.type === 'box-union') {
        return `${operation.id}:box:${operation.box.origin.join(',')}:${operation.box.size.join(',')}`
      }
      return operation.id
    })
    .join(';')
}

export function cadKernelOperationsForModel(cadDocument: ProjectCADDocument | undefined, modelId: string): CadKernelOperation[] {
  const sourceNodeIDs = new Set((cadDocument?.nodes ?? []).filter((node) => node.model_id === modelId).map((node) => node.id))
  const geometryOperations: CadKernelOperation[] = []
  let latestTransform: CadKernelOperation | undefined

  for (const operation of cadDocument?.operations ?? []) {
    if (operation.model_id !== modelId) {
      continue
    }
    if (operation.type === 'transform' && operation.transform) {
      const isSourceTransform =
        !operation.node_id || (sourceNodeIDs.size > 0 ? sourceNodeIDs.has(operation.node_id) : operation.node_id === `node_${modelId}`)
      if (isSourceTransform) {
        latestTransform = {
          id: operation.id,
          type: operation.type,
          modelId: operation.model_id,
          matrix: operation.transform.matrix,
        }
      }
      continue
    }
    if (operation.type === 'box-union' && operation.box) {
      geometryOperations.push({
        id: operation.id,
        type: operation.type,
        modelId: operation.model_id,
        box: operation.box,
      })
    }
  }

  return latestTransform ? [...geometryOperations, latestTransform] : geometryOperations
}

export function getModelDisplayName(model: ProjectModel) {
  const parsedName = model.metadata.product_names?.[0]?.trim()
  if (parsedName) {
    return parsedName
  }
  return getSourceDisplayName(model)
}

export function getSourceDisplayName(model: ProjectModel) {
  return model.original_filename.replace(/\.[^.]+$/, '')
}

export function projectPreviewSummary({ modelCount, previewAssetCount, latestPreviewFormat = '' }: ProjectPreviewSummaryInput) {
  const isReady = previewAssetCount > 0
  const sourceWord = modelCount === 1 ? 'source' : 'sources'
  const meshWord = previewAssetCount === 1 ? 'mesh' : 'meshes'
  const previewFormat = latestPreviewFormat ? latestPreviewFormat.toUpperCase() : 'Preview'

  return {
    isReady,
    previewLabel: isReady ? `${previewAssetCount} ${previewFormat} ${meshWord}` : modelCount > 0 ? 'Preparing' : 'Empty',
    sourceLabel: modelCount > 0 ? `${modelCount} ${sourceWord} stored` : 'Awaiting import',
    sourceBody: isReady
      ? `The project owns ${modelCount} uploaded source ${modelCount === 1 ? 'file' : 'files'} and ${previewAssetCount} browser-loadable preview ${meshWord}.`
      : modelCount > 0
        ? `The project owns ${modelCount} uploaded source ${modelCount === 1 ? 'file' : 'files'}. Mesh preview generation is pending.`
        : 'The workbench starts empty until real CAD source files are imported.',
  }
}
