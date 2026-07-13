import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState, type ChangeEvent } from 'react'

import { uploadProjectModel } from 'src/api/projects'

type UploadProjectModel = (projectId: string, file: File) => Promise<unknown>

type UseProjectModelUploadControllerOptions = {
  dependencies?: {
    uploadProjectModel?: UploadProjectModel
  }
  projectId: string
}

const uploadErrorMessage = 'Model upload failed. Check that the file is STEP, GLTF, GLB, or STL and try again.'

const defaultUploadProjectModel: UploadProjectModel = (projectId, file) => uploadProjectModel(projectId, file)

export function useProjectModelUploadController({
  dependencies,
  projectId,
}: UseProjectModelUploadControllerOptions) {
  const queryClient = useQueryClient()
  const [uploadError, setUploadError] = useState('')
  const uploadModel = dependencies?.uploadProjectModel ?? defaultUploadProjectModel
  const { isPending, mutate } = useMutation({
    mutationFn: (file: File) => uploadModel(projectId, file),
    onSuccess: async () => {
      setUploadError('')
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'models'] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'cad-document'] })
    },
    onError: () => {
      setUploadError(uploadErrorMessage)
    },
  })

  const uploadModelFile = useCallback(
    (file?: File) => {
      if (!file) {
        return
      }
      mutate(file)
    },
    [mutate],
  )

  const handleModelFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      uploadModelFile(event.target.files?.[0])
      event.target.value = ''
    },
    [uploadModelFile],
  )

  return {
    handleModelFileChange,
    isUploading: isPending,
    uploadError,
    uploadModelFile,
  }
}
