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
  meshSummary: CadKernelMeshSummary
  documentRevision?: number
  transform?: undefined
}

export type ProjectPreviewAsset = ProjectPreviewUrlAsset | ProjectPreviewKernelMeshAsset

export type ProjectPreviewSummaryInput = {
  modelCount: number
  previewAssetCount: number
  latestPreviewFormat?: string
}

export function parsedPreviewModels(models: ProjectModel[]) {
  return models.filter((model) => model.parse_status === 'parsed')
}

export function buildProjectPreviewAssets(
  models: ProjectModel[],
  previewArtifacts: ProjectModelPreviewArtifact[],
  previewUrlsByModelID: Record<string, string>,
  kernelMeshesByModelID: Record<string, { mesh: CadKernelMesh; meshSummary: CadKernelMeshSummary }> = {},
  cadDocument?: ProjectCADDocument,
) {
  const artifactByModelID = new Map(previewArtifacts.map((artifact) => [artifact.model_id, artifact]))
  const transformByModelID = new Map((cadDocument?.nodes ?? []).map((node) => [node.model_id, node.transform]))

  return models.flatMap((model): ProjectPreviewAsset[] => {
    const kernelMesh = model.format === 'step' ? kernelMeshesByModelID[model.id] : undefined
    const transform = transformByModelID.get(model.id)
    if (kernelMesh) {
      return [
        {
          modelId: model.id,
          name: getModelDisplayName(model),
          previewFormat: 'kernel-mesh',
          documentRevision: cadDocument?.revision,
          ...kernelMesh,
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

export function projectPreviewAssetSignature(assets: readonly ProjectPreviewAsset[]) {
  return assets
    .map((asset) => {
      const transformSignature = asset.transform ? `:${asset.transform.matrix.join(',')}` : ''
      if (asset.previewFormat === 'kernel-mesh') {
        const revisionSignature = asset.documentRevision === undefined ? '' : `:rev${asset.documentRevision}`
        return `${asset.modelId}:${asset.previewFormat}:${asset.mesh.positions.length}:${asset.mesh.normals.length}:${asset.mesh.indices.length}${revisionSignature}`
      }
      return `${asset.modelId}:${asset.previewFormat}:${asset.previewUrl}${transformSignature}`
    })
    .join('|')
}

export function cadKernelOperationsForModel(cadDocument: ProjectCADDocument | undefined, modelId: string): CadKernelOperation[] {
  return (cadDocument?.operations ?? [])
    .filter((operation) => operation.model_id === modelId)
    .map((operation) => ({
      id: operation.id,
      type: operation.type,
      modelId: operation.model_id,
      matrix: operation.transform.matrix,
    }))
}

export function getModelDisplayName(model: ProjectModel) {
  const parsedName = model.metadata.product_names?.[0]?.trim()
  if (parsedName) {
    return parsedName
  }
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
