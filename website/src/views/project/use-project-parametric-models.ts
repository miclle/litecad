import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { fetchProjectModelSource } from 'src/api/projects'
import { runFeatureDSLPreviewInWorker, type CadKernelWorkerPreviewResult } from 'src/cad/kernel-worker-client'
import type { OpenSCADParameterValue } from 'src/cad/openscad-protocol'
import type { ProjectModel, ProjectParametricArtifact } from 'src/types/project'
import { buildFeatureDSLPreviewInput } from './project-feature-dsl-preview'
import { getModelDisplayName, parsedPreviewModels } from './project-preview-assets'

type UseProjectParametricModelsOptions = {
  projectId: string
  projectModels: ProjectModel[]
  selectedArtifact?: ProjectParametricArtifact
  selectedSourceModel?: ProjectModel
}

export function useProjectParametricModels({
  projectId,
  projectModels,
  selectedArtifact,
  selectedSourceModel,
}: UseProjectParametricModelsOptions) {
  const queryClient = useQueryClient()
  const [parameterOverridesByModelID, setParameterOverridesByModelID] = useState<
    Record<string, Record<string, OpenSCADParameterValue>>
  >({})
  const modelRevisionByIDRef = useRef(new Map<string, string>())
  const selectedSourceModelID = selectedSourceModel?.id ?? ''
  const selectedSourceQuery = useQuery({
    queryKey: ['projects', projectId, 'models', selectedSourceModelID, 'parametric-source'],
    queryFn: async () => (await fetchProjectModelSource(projectId, selectedSourceModelID)).data.text(),
    enabled: projectId !== '' && isParametricProjectModelFormat(selectedSourceModel?.format) && !selectedArtifact,
  })
  const selectedSavedArtifact = useMemo<ProjectParametricArtifact | undefined>(() => {
    if (!selectedSourceModel || !isParametricProjectModelFormat(selectedSourceModel.format) || !selectedSourceQuery.data) {
      return undefined
    }
    return {
      id: `model-${selectedSourceModel.id}`,
      project_id: projectId,
      conversation_id: '',
      message_id: '',
      title: getModelDisplayName(selectedSourceModel),
      source_kind: selectedSourceModel.format === 'lcad' ? 'litecad-feature-dsl' : 'openscad',
      source_code: selectedSourceQuery.data,
      parameter_values: selectedSourceModel.metadata.parameter_values ?? {},
      compile_status: 'success',
      compile_error: '',
      preview_model_id: selectedSourceModel.id,
      generation_tool_mode: '',
      generation_duration_ms: 0,
      created_at: selectedSourceModel.created_at,
      updated_at: selectedSourceModel.updated_at,
    }
  }, [projectId, selectedSourceModel, selectedSourceQuery.data])
  const previewModels = useMemo(
    () =>
      parsedPreviewModels(projectModels).map((model) => {
        const parameterValues = parameterOverridesByModelID[model.id]
        if (model.format !== 'lcad' || !parameterValues) {
          return model
        }
        return { ...model, metadata: { ...model.metadata, parameter_values: parameterValues } }
      }),
    [parameterOverridesByModelID, projectModels],
  )

  useEffect(() => {
    const nextRevisionByID = new Map(projectModels.map((model) => [model.id, model.current_revision_id]))
    const previousRevisionByID = modelRevisionByIDRef.current
    modelRevisionByIDRef.current = nextRevisionByID
    setParameterOverridesByModelID((currentOverrides) => {
      const nextOverrides = { ...currentOverrides }
      let changed = false
      for (const modelID of Object.keys(currentOverrides)) {
        const previousRevision = previousRevisionByID.get(modelID)
        const nextRevision = nextRevisionByID.get(modelID)
        if (!nextRevision || (previousRevision && previousRevision !== nextRevision)) {
          delete nextOverrides[modelID]
          changed = true
        }
      }
      return changed ? nextOverrides : currentOverrides
    })
  }, [projectModels])
  const featureDSLPreviewModels = useMemo(
    () => previewModels.filter((model) => model.format === 'lcad'),
    [previewModels],
  )
  const featureDSLPreviewQueries = useQueries({
    queries: featureDSLPreviewModels.map((model) => ({
      queryKey: [
        'projects',
        projectId,
        'models',
        model.id,
        'feature-dsl-preview',
        model.updated_at,
        stableJSONStringify(model.metadata.parameter_values ?? {}),
      ],
      queryFn: async () => {
        const sourceQueryKey = ['projects', projectId, 'models', model.id, 'parametric-source'] as const
        const cachedSourceText = queryClient.getQueryData<string>(sourceQueryKey)
        const sourceText = cachedSourceText ?? (await (await fetchProjectModelSource(projectId, model.id)).data.text())
        if (cachedSourceText === undefined) {
          queryClient.setQueryData(sourceQueryKey, sourceText)
        }
        return runFeatureDSLPreviewInWorker(buildFeatureDSLPreviewInput(model, sourceText))
      },
      enabled: projectId !== '',
      placeholderData: (previousData: CadKernelWorkerPreviewResult | undefined) => previousData,
      retry: false,
    })),
  })
  const [featureDSLKernelMeshesByModelID, setFeatureDSLKernelMeshesByModelID] = useState<
    Record<string, CadKernelWorkerPreviewResult>
  >({})

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setFeatureDSLKernelMeshesByModelID((currentMeshes) => {
        const nextMeshes: Record<string, CadKernelWorkerPreviewResult> = {}
        featureDSLPreviewModels.forEach((model, index) => {
          const previewMesh = featureDSLPreviewQueries[index]?.data ?? currentMeshes[model.id]
          if (previewMesh) {
            nextMeshes[model.id] = previewMesh
          }
        })
        const currentModelIDs = Object.keys(currentMeshes)
        const nextModelIDs = Object.keys(nextMeshes)
        if (
          currentModelIDs.length === nextModelIDs.length &&
          nextModelIDs.every((modelID) => currentMeshes[modelID] === nextMeshes[modelID])
        ) {
          return currentMeshes
        }
        return nextMeshes
      })
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [featureDSLPreviewModels, featureDSLPreviewQueries])

  const updatePreviewParameters = useCallback(
    (modelID: string, parameterValues: Record<string, OpenSCADParameterValue>) => {
      setParameterOverridesByModelID((currentOverrides) => {
        if (stableJSONStringify(currentOverrides[modelID] ?? {}) === stableJSONStringify(parameterValues)) {
          return currentOverrides
        }
        return { ...currentOverrides, [modelID]: parameterValues }
      })
    },
    [],
  )

  return {
    featureDSLKernelMeshesByModelID,
    featureDSLPreviewModels,
    featureDSLPreviewQueries,
    kernelMeshesByModelID: featureDSLKernelMeshesByModelID,
    parameterOverridesByModelID,
    previewModels,
    selectedSavedArtifact,
    updatePreviewParameters,
  }
}

function isParametricProjectModelFormat(format: string | undefined) {
  return format === 'scad' || format === 'lcad'
}

function stableJSONStringify(value: Record<string, unknown>) {
  const ordered: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    ordered[key] = value[key]
  }
  return JSON.stringify(ordered)
}
