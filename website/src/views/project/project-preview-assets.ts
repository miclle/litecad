import type { ProjectModel, ProjectModelPreviewArtifact } from 'src/types/project'

export type ProjectPreviewAsset = {
  modelId: string
  name: string
  previewFormat: ProjectModelPreviewArtifact['format']
  previewUrl: string
}

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
) {
  const artifactByModelID = new Map(previewArtifacts.map((artifact) => [artifact.model_id, artifact]))

  return models.flatMap((model): ProjectPreviewAsset[] => {
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
      },
    ]
  })
}

export function getModelDisplayName(model: ProjectModel) {
  const parsedName = model.metadata.product_names[0]?.trim()
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
