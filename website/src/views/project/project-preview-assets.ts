import type { CADAssembly, CADAssemblyOccurrence, CADTransform, ProjectCADDocument, ProjectModel, ProjectModelPreviewArtifact } from 'src/types/project'
import type { CadKernelMesh, CadKernelMeshSummary, CadKernelOperation } from 'src/cad/kernel-protocol'

export type ProjectPreviewUrlAsset = {
  modelId: string
  occurrenceId?: string
  name: string
  previewFormat: ProjectModelPreviewArtifact['format']
  previewUrl: string
  transform?: CADTransform
}

export type ProjectPreviewKernelMeshAsset = {
  modelId: string
  occurrenceId?: string
  name: string
  previewFormat: 'kernel-mesh'
  mesh: CadKernelMesh
  componentMeshes?: CadKernelMesh[]
  meshSummary: CadKernelMeshSummary
  geometrySignature?: string
  pickTargets?: { modelId: string; nodeId: string; name: string }[]
  transform?: CADTransform
}

export type ProjectPreviewAsset = ProjectPreviewUrlAsset | ProjectPreviewKernelMeshAsset

export type ProjectPreviewSummaryInput = {
  modelCount: number
  previewAssetCount: number
  latestPreviewFormat?: string
  t?: (key: string, options?: Record<string, unknown>) => string
}

export type ProjectModelTreeGroup = {
  assemblyId: string
  assemblyName: string
  assemblyOccurrenceCount?: number
  occurrenceId: string
  modelRevisionId: string
  occurrenceIndex?: number
  modelOccurrenceCount?: number
  suppressed?: boolean
  effectivelySuppressed?: boolean
  parentGroupId?: string
  isSubassemblyMember?: boolean
  occurrenceName?: string
  model: ProjectModel
  sourceNodeId: string
  displayName: string
  children: { id: string; name: string; sourceModelId: string }[]
}

type ProjectPreviewPickTarget = {
  modelId: string
  nodeId: string
  name: string
  componentIndex?: number
}

export function parsedPreviewModels(models: ProjectModel[]) {
  return models.filter((model) => model.parse_status === 'parsed')
}

export function visibleProjectModels(models: ProjectModel[], cadDocument?: ProjectCADDocument) {
  if (!cadDocument) {
    return models
  }
  if (cadDocument.assembly) {
    const modelByID = new Map(models.map((model) => [model.id, model]))
    return cadDocument.assembly.occurrences.flatMap((occurrence) => {
      const model = modelByID.get(occurrence.model_id)
      return model ? [model] : []
    })
  }
  const visibleSourceModelIds = new Set(cadDocument.nodes.filter((node) => node.model_id).map((node) => node.model_id))
  return models.filter((model) => visibleSourceModelIds.has(model.id))
}

export function buildProjectModelTree(models: ProjectModel[], cadDocument?: ProjectCADDocument): ProjectModelTreeGroup[] {
  const sourceModelIDByNodeID = buildSourceModelIDByNodeID(cadDocument)
  const componentNodesByParentID = new Map<string, { id: string; name: string; sourceModelId: string }[]>()
  for (const node of cadDocument?.nodes ?? []) {
    if (node.source_format !== 'step-component' || !node.parent_node_id || !node.name.trim()) {
      continue
    }
    const nodes = componentNodesByParentID.get(node.parent_node_id) ?? []
    nodes.push({
      id: node.id,
      name: node.name.trim(),
      sourceModelId: node.source_model_id || sourceModelIDByNodeID.get(node.parent_node_id) || node.model_id,
    })
    componentNodesByParentID.set(node.parent_node_id, nodes)
  }

  const modelByID = new Map(models.map((model) => [model.id, model]))
  const treeEntries = cadDocument?.assembly
    ? cadDocument.assembly.occurrences.flatMap((occurrence, occurrenceIndex) => {
        const model = modelByID.get(occurrence.model_id)
        return model ? [{ model, occurrence, occurrenceIndex }] : []
      })
    : visibleProjectModels(models, cadDocument).map((model, occurrenceIndex) => ({
        model,
        occurrence: undefined,
        occurrenceIndex,
      }))
  const displayNameCounts = new Map<string, number>()
  const modelOccurrenceCounts = new Map<string, number>()
  for (const { model, occurrence } of treeEntries) {
    const name = occurrenceDisplayName(model, occurrence?.name)
    displayNameCounts.set(name, (displayNameCounts.get(name) ?? 0) + 1)
    modelOccurrenceCounts.set(model.id, (modelOccurrenceCounts.get(model.id) ?? 0) + 1)
  }
  const displayNameIndexes = new Map<string, number>()

  return treeEntries.map(({ model, occurrence, occurrenceIndex }) => {
    const parentNodeID = `node_${model.id}`
    const documentChildren = componentNodesByParentID.get(parentNodeID) ?? []
    const metadataChildren = cadDocument
      ? documentChildren
      : documentChildren.length > 0
        ? documentChildren
        : (model.metadata.components ?? [])
            .map((component, index) => ({
              id: `node_${model.id}_component_${index + 1}`,
              name: component.name.trim(),
              sourceModelId: model.id,
            }))
            .filter((component) => component.name !== '')

    const sourceDisplayName = metadataChildren.length > 1 ? getSourceDisplayName(model) : getModelDisplayName(model)
    const baseDisplayName = occurrence ? occurrenceDisplayName(model, occurrence.name, sourceDisplayName) : sourceDisplayName
    const duplicateIndex = (displayNameIndexes.get(baseDisplayName) ?? 0) + 1
    const duplicateCount = displayNameCounts.get(baseDisplayName) ?? 0
    displayNameIndexes.set(baseDisplayName, duplicateIndex)

    return {
      assemblyId: cadDocument?.assembly?.id ?? '',
      assemblyName: cadDocument?.assembly?.name ?? '',
      ...(occurrence ? { assemblyOccurrenceCount: treeEntries.length } : {}),
      occurrenceId: occurrence?.id ?? '',
      modelRevisionId: occurrence?.model_revision_id ?? model.current_revision_id,
      ...(occurrence
        ? {
            occurrenceIndex,
            modelOccurrenceCount: modelOccurrenceCounts.get(model.id) ?? 1,
            suppressed: occurrence.suppressed,
            effectivelySuppressed: isCADAssemblyOccurrenceEffectivelySuppressed(cadDocument?.assembly, occurrence),
            parentGroupId: occurrence.parent_group_id ?? '',
            isSubassemblyMember: Boolean(occurrence.subassembly_member_id),
          }
        : {}),
      ...(occurrence ? { occurrenceName: baseDisplayName } : {}),
      model,
      sourceNodeId: parentNodeID,
      displayName: duplicateCount > 1 ? `${baseDisplayName} · ${duplicateIndex}` : baseDisplayName,
      children: metadataChildren.length > 1 ? metadataChildren : [],
    }
  })
}

export function buildProjectPreviewAssets(
  models: ProjectModel[],
  previewArtifacts: ProjectModelPreviewArtifact[],
  previewUrlsByModelID: Record<string, string>,
  kernelMeshesByModelID: Record<
    string,
    {
      mesh: CadKernelMesh
      componentMeshes?: CadKernelMesh[]
      meshSummary: CadKernelMeshSummary
    }
  > = {},
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
    nodes.push({
      modelId: sourceModelID,
      nodeId: node.id,
      name: node.name.trim(),
      componentIndex: componentIndexFromNodeID(node.id),
    })
    componentNodesBySourceModelID.set(sourceModelID, nodes)
  }

  const modelByID = new Map(models.map((model) => [model.id, model]))
  const previewEntries = cadDocument?.assembly
    ? cadDocument.assembly.occurrences.flatMap((occurrence) => {
        const model = modelByID.get(occurrence.model_id)
        return model && !isCADAssemblyOccurrenceEffectivelySuppressed(cadDocument.assembly, occurrence) ? [{ model, occurrence }] : []
      })
    : visibleProjectModels(models, cadDocument).map((model) => ({
        model,
        occurrence: undefined,
      }))

  return previewEntries.flatMap(({ model, occurrence }): ProjectPreviewAsset[] => {
    const kernelMesh = model.format === 'step' || model.format === 'lcad' ? kernelMeshesByModelID[model.id] : undefined
    const transform = occurrence?.transform ?? transformByModelID.get(model.id)
    const name = occurrenceDisplayName(model, occurrence?.name)
    if (kernelMesh) {
      const geometrySignature = cadKernelGeometryOperationSignature(cadDocument, model.id)
      const pickTargetsWithIndex = cadDocument
        ? (componentNodesBySourceModelID.get(model.id) ?? [])
        : (componentNodesBySourceModelID.get(model.id) ??
          (model.metadata.components ?? [])
            .map((component, index) => ({
              modelId: model.id,
              nodeId: `node_${model.id}_component_${index + 1}`,
              name: component.name.trim(),
              componentIndex: index,
            }))
            .filter((component) => component.name !== ''))
      const filteredComponentMeshes =
        kernelMesh.componentMeshes && pickTargetsWithIndex.length > 0
          ? pickTargetsWithIndex
              .map((target) => (target.componentIndex === undefined ? undefined : kernelMesh.componentMeshes?.[target.componentIndex]))
              .filter((mesh): mesh is CadKernelMesh => Boolean(mesh))
          : undefined
      const pickTargets = pickTargetsWithIndex.map(({ modelId, nodeId, name }) => ({ modelId, nodeId, name }))
      return [
        {
          modelId: model.id,
          ...(occurrence ? { occurrenceId: occurrence.id } : {}),
          name,
          previewFormat: 'kernel-mesh',
          mesh: kernelMesh.mesh,
          meshSummary: kernelMesh.meshSummary,
          ...(geometrySignature ? { geometrySignature } : {}),
          ...(pickTargets.length > 1 || filteredComponentMeshes?.length ? { pickTargets } : {}),
          ...(filteredComponentMeshes?.length ? { componentMeshes: filteredComponentMeshes } : kernelMesh.componentMeshes ? {} : {}),
          ...(transform ? { transform } : {}),
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
        ...(occurrence ? { occurrenceId: occurrence.id } : {}),
        name,
        previewFormat: artifact.format,
        previewUrl,
        transform,
      },
    ]
  })
}

export function isCADAssemblyOccurrenceEffectivelySuppressed(assembly: CADAssembly | undefined, occurrence: CADAssemblyOccurrence) {
  if (occurrence.suppressed) {
    return true
  }
  const groupByID = new Map((assembly?.groups ?? []).map((group) => [group.id, group]))
  const visited = new Set<string>()
  let groupID = occurrence.parent_group_id ?? ''
  while (groupID) {
    if (visited.has(groupID)) {
      return true
    }
    visited.add(groupID)
    const group = groupByID.get(groupID)
    if (!group || group.suppressed) {
      return true
    }
    groupID = group.parent_group_id
  }
  return false
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
  return assets.map(projectPreviewAssetContentSignature).join('|')
}

export function projectPreviewSceneSignature(assets: readonly ProjectPreviewAsset[]) {
  return assets
    .map((asset) => {
      if (asset.previewFormat === 'kernel-mesh') {
        const geometrySignature = asset.geometrySignature ? `:${asset.geometrySignature}` : ''
        const pickTargetSignature = asset.pickTargets
          ? `:${asset.pickTargets.map((target) => `${target.modelId}/${target.nodeId}/${target.name}`).join(',')}`
          : ''
        return `${projectPreviewAssetIdentityPrefix(asset)}${asset.previewFormat}:${asset.name}${geometrySignature}:${asset.componentMeshes?.length ?? 0}${pickTargetSignature}`
      }
      return `${projectPreviewAssetIdentityPrefix(asset)}${asset.previewFormat}:${asset.previewUrl}`
    })
    .join('|')
}

export function projectPreviewAssetContentSignature(asset: ProjectPreviewAsset) {
  if (asset.previewFormat === 'kernel-mesh') {
    const geometrySignature = asset.geometrySignature ? `:${asset.geometrySignature}` : ''
    const componentMeshSignature = asset.componentMeshes?.length ? `:${asset.componentMeshes.map(cadKernelMeshContentSignature).join(',')}` : ''
    const pickTargetSignature = asset.pickTargets ? `:${asset.pickTargets.map((target) => `${target.modelId}/${target.nodeId}/${target.name}`).join(',')}` : ''
    return `${projectPreviewAssetIdentityPrefix(asset)}${asset.previewFormat}:${cadKernelMeshContentSignature(asset.mesh)}${geometrySignature}${componentMeshSignature}${pickTargetSignature}`
  }
  return `${projectPreviewAssetIdentityPrefix(asset)}${asset.previewFormat}:${asset.previewUrl}`
}

export function projectPreviewAssetId(asset: ProjectPreviewAsset) {
  return asset.occurrenceId || asset.modelId
}

function projectPreviewAssetIdentityPrefix(asset: ProjectPreviewAsset) {
  return asset.occurrenceId ? `${asset.occurrenceId}:${asset.modelId}:` : `${asset.modelId}:`
}

function occurrenceDisplayName(model: ProjectModel, occurrenceName?: string, defaultDisplayName = getModelDisplayName(model)) {
  const name = occurrenceName?.trim()
  return !name || name === model.original_filename ? defaultDisplayName : name
}

function cadKernelMeshContentSignature(mesh: CadKernelMesh) {
  return [
    numericArrayContentSignature(mesh.positions, 100000),
    numericArrayContentSignature(mesh.normals, 100000),
    numericArrayContentSignature(mesh.indices, 1),
  ].join('/')
}

function numericArrayContentSignature(values: readonly number[], precision: number) {
  let hash = 2166136261
  for (const value of values) {
    const normalizedValue = Number.isFinite(value) ? Math.round(value * precision) : 0
    hash ^= normalizedValue
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return `${values.length}:${hash.toString(16)}`
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
      const isSourceTransform = !operation.node_id || (sourceNodeIDs.size > 0 ? sourceNodeIDs.has(operation.node_id) : operation.node_id === `node_${modelId}`)
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

export function projectPreviewSummary({
  modelCount,
  previewAssetCount,
  latestPreviewFormat = '',
  t = defaultProjectPreviewSummaryTranslator,
}: ProjectPreviewSummaryInput) {
  const isReady = previewAssetCount > 0
  const meshWord = t('project.previewSummary.meshWord', {
    count: previewAssetCount,
  })
  const previewFormat = latestPreviewFormat ? latestPreviewFormat.toUpperCase() : t('project.previewSummary.previewFormat')

  return {
    isReady,
    previewLabel: isReady
      ? t('project.previewSummary.meshCount', {
          count: previewAssetCount,
          format: previewFormat,
        })
      : modelCount > 0
        ? t('project.previewSummary.preparing')
        : t('project.previewSummary.empty'),
    sourceLabel: modelCount > 0 ? t('project.previewSummary.sourceStored', { count: modelCount }) : t('project.previewSummary.awaitingImport'),
    sourceBody: isReady
      ? t('project.previewSummary.readyBody', {
          count: modelCount,
          modelCount,
          previewAssetCount,
          meshWord,
        })
      : modelCount > 0
        ? t('project.previewSummary.pendingBody', { count: modelCount })
        : t('project.previewSummary.emptyBody'),
  }
}

function defaultProjectPreviewSummaryTranslator(key: string, options: Record<string, unknown> = {}) {
  const count = Number(options.count ?? 0)
  const modelCount = Number(options.modelCount ?? count)
  const previewAssetCount = Number(options.previewAssetCount ?? 0)
  const format = String(options.format ?? 'Preview')
  const meshWord = String(options.meshWord ?? (count === 1 ? 'mesh' : 'meshes'))

  if (key === 'project.previewSummary.meshWord') {
    return count === 1 ? 'mesh' : 'meshes'
  }
  if (key === 'project.previewSummary.previewFormat') {
    return 'Preview'
  }
  if (key === 'project.previewSummary.meshCount') {
    return `${count} ${format} ${count === 1 ? 'mesh' : 'meshes'}`
  }
  if (key === 'project.previewSummary.preparing') {
    return 'Preparing'
  }
  if (key === 'project.previewSummary.empty') {
    return 'Empty'
  }
  if (key === 'project.previewSummary.sourceStored') {
    return `${count} ${count === 1 ? 'source' : 'sources'} stored`
  }
  if (key === 'project.previewSummary.awaitingImport') {
    return 'Awaiting import'
  }
  if (key === 'project.previewSummary.readyBody') {
    return `The project owns ${modelCount} uploaded source ${modelCount === 1 ? 'file' : 'files'} and ${previewAssetCount} browser-loadable preview ${meshWord}.`
  }
  if (key === 'project.previewSummary.pendingBody') {
    return `The project owns ${count} uploaded source ${count === 1 ? 'file' : 'files'}. Mesh preview generation is pending.`
  }
  if (key === 'project.previewSummary.emptyBody') {
    return 'The workbench starts empty until real CAD source files are imported.'
  }
  return key
}
