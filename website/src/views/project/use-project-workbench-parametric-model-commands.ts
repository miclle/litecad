import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  saveProjectParametricArtifactModel,
  restoreProjectModelRevision,
  updateProjectParametricArtifact,
  updateProjectParametricModelParameters,
} from 'src/api/projects'
import type { OpenSCADParameterValue } from 'src/cad/openscad-protocol'
import type { ProjectCADDocument, ProjectModel, ProjectParametricArtifact } from 'src/types/project'

type ProjectWorkbenchParametricModelCommandsOptions = {
  onArtifactSaveError: () => void
  onConflict?: () => void
  onModelSelected: (modelID: string) => void
  projectId: string
}

type SaveGeneratedArtifactAsModelInput = {
  artifact: ProjectParametricArtifact
  parameterValues: Record<string, OpenSCADParameterValue>
}

type SaveModelParametersInput = {
  modelID: string
  parameterValues: Record<string, OpenSCADParameterValue>
}

type RestoreModelRevisionInput = {
  modelID: string
  revisionID: string
}

export function useProjectWorkbenchParametricModelCommands({
  onArtifactSaveError,
  onConflict,
  onModelSelected,
  projectId,
}: ProjectWorkbenchParametricModelCommandsOptions) {
  const queryClient = useQueryClient()
  const documentQueryKey = ['projects', projectId, 'cad-document'] as const

  const currentDocumentRevision = () => {
    const revision = queryClient.getQueryData<ProjectCADDocument>(documentQueryKey)?.revision ?? 0
    if (revision <= 0) {
      throw new Error('CAD document is not loaded')
    }
    return revision
  }

  const handleModelMutationError = async (error: unknown) => {
    if ((error as { response?: { status?: number } }).response?.status !== 409) {
      return
    }
    onConflict?.()
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: documentQueryKey }),
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'models'] }),
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'cad-document', 'history'] }),
    ])
  }

  const saveProjectParametricArtifactMutation = useMutation({
    mutationFn: async ({ artifact, parameterValues }: SaveGeneratedArtifactAsModelInput) => {
      await updateProjectParametricArtifact(projectId, artifact.id, {
        title: artifact.title,
        source_kind: artifact.source_kind,
        source_code: artifact.source_code,
        parameter_values: parameterValues,
        compile_status: 'success',
        compile_error: '',
      })
      return (await saveProjectParametricArtifactModel(projectId, artifact.id)).data.model
    },
    onSuccess: async (model: ProjectModel) => {
      onModelSelected(model.id)
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'models'] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'cad-document'] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'parametric-artifacts'] })
    },
    onError: onArtifactSaveError,
  })

  const updateProjectParametricModelParametersMutation = useMutation({
    mutationFn: async ({ modelID, parameterValues }: SaveModelParametersInput) =>
      (
        await updateProjectParametricModelParameters(projectId, modelID, {
          parameter_values: parameterValues,
          expected_revision: currentDocumentRevision(),
        })
      ).data.model,
    onSuccess: async (model: ProjectModel) => {
      onModelSelected(model.id)
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'models'] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'cad-document'] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'cad-document', 'history'] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'models', model.id, 'revisions'] })
    },
    onError: handleModelMutationError,
  })

  const restoreProjectModelRevisionMutation = useMutation({
    mutationFn: async ({ modelID, revisionID }: RestoreModelRevisionInput) =>
      (await restoreProjectModelRevision(projectId, modelID, revisionID, currentDocumentRevision())).data.model,
    onSuccess: async (model: ProjectModel) => {
      queryClient.removeQueries({ queryKey: ['projects', projectId, 'models', model.id, 'parametric-source'] })
      onModelSelected(model.id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'models'] }),
        queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'models', model.id, 'revisions'] }),
        queryClient.invalidateQueries({ queryKey: documentQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'cad-document', 'history'] }),
      ])
    },
    onError: handleModelMutationError,
  })

  return {
    saveGeneratedArtifactAsModel: saveProjectParametricArtifactMutation.mutate,
    saveModelParameters: updateProjectParametricModelParametersMutation.mutate,
    restoreModelRevision: restoreProjectModelRevisionMutation.mutate,
    isRestoringModelRevision: restoreProjectModelRevisionMutation.isPending,
  }
}
