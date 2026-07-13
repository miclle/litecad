import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  saveProjectParametricArtifactModel,
  updateProjectParametricArtifact,
  updateProjectParametricModelParameters,
} from 'src/api/projects'
import type { OpenSCADParameterValue } from 'src/cad/openscad-protocol'
import type { ProjectModel, ProjectParametricArtifact } from 'src/types/project'

type ProjectWorkbenchParametricModelCommandsOptions = {
  onArtifactSaveError: () => void
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

export function useProjectWorkbenchParametricModelCommands({
  onArtifactSaveError,
  onModelSelected,
  projectId,
}: ProjectWorkbenchParametricModelCommandsOptions) {
  const queryClient = useQueryClient()

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
        })
      ).data.model,
    onSuccess: async (model: ProjectModel) => {
      onModelSelected(model.id)
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'models'] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'cad-document'] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'cad-document', 'history'] })
    },
  })

  return {
    saveGeneratedArtifactAsModel: saveProjectParametricArtifactMutation.mutate,
    saveModelParameters: updateProjectParametricModelParametersMutation.mutate,
  }
}
