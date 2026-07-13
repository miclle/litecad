import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'

import {
  fetchProjectCADDocument,
  fetchProjectModelPreview,
  fetchProjectModelPreviewArtifact,
  fetchProjectModelSource,
  fetchProjectModels,
} from 'src/api/projects'
import { runStepPreviewInWorker, type CadKernelWorkerPreviewResult } from 'src/cad/kernel-worker-client'
import {
  buildProjectModelTree,
  buildProjectPreviewAssets,
  cadKernelGeometryOperationSignature,
  cadKernelGeometryOperationsForModel,
  projectPreviewSummary,
} from './project-preview-assets'
import { translationFromCADTransform, type CADTranslation } from './cad-document-transforms'
import { useProjectParametricModels } from './use-project-parametric-models'
import { useProjectSelectionController } from './use-project-selection-controller'

type UseProjectWorkbenchModelStateOptions = {
  hiddenModelIds: ReadonlySet<string>
  isProjectLoaded: boolean
  projectId: string
}

export function useProjectWorkbenchModelState({
  hiddenModelIds,
  isProjectLoaded,
  projectId,
}: UseProjectWorkbenchModelStateOptions) {
  const [previewUrlsByModelID, setPreviewUrlsByModelID] = useState<Record<string, string>>({})
  const projectModelsQuery = useQuery({
    queryKey: ['projects', projectId, 'models'],
    queryFn: async () => (await fetchProjectModels(projectId)).data.models,
    enabled: projectId !== '' && isProjectLoaded,
  })
  const projectModels = useMemo(() => projectModelsQuery.data ?? [], [projectModelsQuery.data])
  const projectCADDocumentQuery = useQuery({
    queryKey: ['projects', projectId, 'cad-document'],
    queryFn: async () => (await fetchProjectCADDocument(projectId)).data.document,
    enabled: projectId !== '' && projectModelsQuery.isSuccess,
  })
  const projectCADDocument = projectCADDocumentQuery.data
  const cadDocumentNodes = projectCADDocument?.nodes
  const cadNodeByID = useMemo(() => new Map((cadDocumentNodes ?? []).map((node) => [node.id, node])), [cadDocumentNodes])
  const sourceNodeIDByModelID = useMemo(
    () => new Map((cadDocumentNodes ?? []).flatMap((node) => (node.model_id ? [[node.model_id, node.id] as const] : []))),
    [cadDocumentNodes],
  )
  const projectSelection = useProjectSelectionController({
    cadNodeByID,
    projectModels,
    sourceNodeIDByModelID,
  })
  const {
    selectedArtifact: selectedParametricArtifact,
    selectedSourceModel,
  } = projectSelection
  const parametricModels = useProjectParametricModels({
    projectId,
    projectModels,
    selectedArtifact: selectedParametricArtifact,
    selectedSourceModel,
  })
  const projectModelTree = useMemo(() => buildProjectModelTree(projectModels, projectCADDocument), [projectModels, projectCADDocument])
  const modelTranslationsByID = useMemo(() => {
    const translations: Record<string, CADTranslation> = {}
    for (const node of projectCADDocument?.nodes ?? []) {
      const translation = translationFromCADTransform(node.transform)
      translations[node.id] = translation
      if (node.model_id) {
        translations[node.model_id] = translation
      }
    }
    return translations
  }, [projectCADDocument])
  const previewModels = parametricModels.previewModels
  const browserKernelStepPreviewModels = useMemo(() => previewModels.filter((model) => model.format === 'step'), [previewModels])
  const browserKernelFeatureDSLPreviewModels = parametricModels.featureDSLPreviewModels
  const backendPreviewModels = useMemo(() => previewModels.filter((model) => model.format !== 'step' && model.format !== 'lcad'), [previewModels])
  const latestModel = projectModels[0]
  const latestProductName = latestModel?.metadata.product_names?.[0]
  const browserKernelPreviewQueries = useQueries({
    queries: browserKernelStepPreviewModels.map((model) => {
      const geometryOperationSignature = cadKernelGeometryOperationSignature(projectCADDocument, model.id)
      return {
        queryKey: ['projects', projectId, 'models', model.id, 'kernel-preview', geometryOperationSignature],
        queryFn: async () => {
          const source = (await fetchProjectModelSource(projectId, model.id)).data
          return runStepPreviewInWorker({
            filename: model.original_filename,
            stepText: await source.text(),
            operations: cadKernelGeometryOperationsForModel(projectCADDocument, model.id),
          })
        },
        enabled: projectId !== '' && projectCADDocumentQuery.isSuccess,
        retry: false,
      }
    }),
  })
  const browserKernelFeatureDSLPreviewQueries = parametricModels.featureDSLPreviewQueries
  const featureDSLKernelMeshesByModelID = parametricModels.featureDSLKernelMeshesByModelID
  const kernelMeshesByModelID = browserKernelPreviewQueries.reduce<Record<string, CadKernelWorkerPreviewResult>>(
    (meshByModelID, query, index) => {
      const modelID = browserKernelStepPreviewModels[index]?.id
      if (modelID && query.data) {
        meshByModelID[modelID] = query.data
      }
      return meshByModelID
    },
    {},
  )
  browserKernelFeatureDSLPreviewQueries.forEach((query, index) => {
    const modelID = browserKernelFeatureDSLPreviewModels[index]?.id
    const previewMesh = query.data ?? (modelID ? featureDSLKernelMeshesByModelID[modelID] : undefined)
    if (modelID && previewMesh) {
      kernelMeshesByModelID[modelID] = previewMesh
    }
  })
  const projectModelPreviewArtifactQueries = useQueries({
    queries: backendPreviewModels.map((model) => ({
      queryKey: ['projects', projectId, 'models', model.id, 'preview-artifact'],
      queryFn: async () => (await fetchProjectModelPreviewArtifact(projectId, model.id)).data.preview,
      enabled: projectId !== '',
      retry: false,
    })),
  })
  const previewArtifacts = projectModelPreviewArtifactQueries.flatMap((query) => (query.data ? [query.data] : []))
  const previewArtifactByModelID = useMemo(
    () => new Map(previewArtifacts.map((artifact) => [artifact.model_id, artifact])),
    [previewArtifacts],
  )
  const latestKernelPreview = latestModel ? kernelMeshesByModelID[latestModel.id] : undefined
  const latestPreviewArtifact = latestModel ? previewArtifactByModelID.get(latestModel.id) : undefined
  const latestPreviewFormat = latestKernelPreview ? 'kernel' : (latestPreviewArtifact?.format ?? '')
  const latestTriangleCount =
    latestKernelPreview?.meshSummary.triangleCount ?? latestPreviewArtifact?.facet_count ?? latestModel?.metadata.triangle_count ?? 0
  const projectModelPreviewQueries = useQueries({
    queries: backendPreviewModels.map((model) => {
      const artifact = previewArtifactByModelID.get(model.id)
      return {
        queryKey: ['projects', projectId, 'models', model.id, 'preview'],
        queryFn: async () => (await fetchProjectModelPreview(projectId, model.id)).data,
        enabled: projectId !== '' && Boolean(artifact),
        retry: false,
      }
    }),
  })
  const previewAssets = useMemo(
    () => buildProjectPreviewAssets(previewModels, previewArtifacts, previewUrlsByModelID, kernelMeshesByModelID, projectCADDocument),
    [kernelMeshesByModelID, previewArtifacts, previewModels, previewUrlsByModelID, projectCADDocument],
  )
  const previewAssetModelIDs = useMemo(() => new Set(previewAssets.map((asset) => asset.modelId)), [previewAssets])
  const visibleModelIds = useMemo(
    () => previewAssets.flatMap((asset) => (hiddenModelIds.has(asset.modelId) ? [] : [asset.modelId])),
    [hiddenModelIds, previewAssets],
  )
  const areAllPreviewAssetsHidden = previewAssets.length > 0 && visibleModelIds.length === 0
  const previewSummary = projectPreviewSummary({
    modelCount: projectModels.length,
    previewAssetCount: previewAssets.length,
    latestPreviewFormat: latestPreviewFormat || previewAssets[0]?.previewFormat,
  })
  const shouldShowCanvasStatus = !latestModel || previewAssets.length === 0 || areAllPreviewAssetsHidden
  const canvasStatusLabel = areAllPreviewAssetsHidden ? 'Model layers hidden' : previewSummary.sourceLabel
  const canvasStatusBody = areAllPreviewAssetsHidden
    ? 'All preview layers are hidden. Show a model layer from the project tree to inspect the geometry again.'
    : latestModel
    ? `${latestProductName || latestModel.original_filename} metadata is parsed. Geometry preview is being prepared.`
    : 'The canvas is empty until imported geometry is prepared for preview. Import a CAD source file to attach real model data to this project.'
  const previewBlobSignature = projectModelPreviewQueries
    .map((query, index) => {
      const modelID = backendPreviewModels[index]?.id ?? ''
      const blob = query.data
      return `${modelID}:${blob ? `${blob.type}:${blob.size}` : 'pending'}`
    })
    .join('|')

  useEffect(() => {
    const nextPreviewUrlsByModelID: Record<string, string> = {}
    const objectUrls: string[] = []

    projectModelPreviewQueries.forEach((query, index) => {
      const blob = query.data
      const modelID = backendPreviewModels[index]?.id
      if (!blob || !modelID) {
        return
      }
      const objectUrl = URL.createObjectURL(blob)
      nextPreviewUrlsByModelID[modelID] = objectUrl
      objectUrls.push(objectUrl)
    })

    // Object URL publication is tied to query blob lifecycle and revoked in this effect cleanup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrlsByModelID(nextPreviewUrlsByModelID)
    return () => {
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewBlobSignature])

  return {
    areAllPreviewAssetsHidden,
    backendPreviewModels,
    cadNodeByID,
    canvasStatusBody,
    canvasStatusLabel,
    latestModel,
    latestTriangleCount,
    modelTranslationsByID,
    parametricModels,
    previewAssetModelIDs,
    previewAssets,
    previewSummary,
    projectCADDocument,
    projectCADDocumentQuery,
    projectModelTree,
    projectModels,
    projectModelsQuery,
    projectSelection,
    shouldShowCanvasStatus,
    sourceNodeIDByModelID,
    visibleModelIds,
  }
}
