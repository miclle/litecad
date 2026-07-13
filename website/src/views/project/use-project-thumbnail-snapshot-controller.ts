import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef } from 'react'

import { uploadProjectThumbnailSnapshot } from 'src/api/projects'
import type { ProjectThumbnailSnapshot } from 'src/types/project'
import type { ModelPreviewSnapshotCapture } from './model-preview'
import { projectPreviewAssetSignature, type ProjectPreviewAsset } from './project-preview-assets'

type SaveThumbnailSnapshot = (
  projectId: string,
  snapshot: ModelPreviewSnapshotCapture,
  revision: number,
) => Promise<ProjectThumbnailSnapshot>

type UseProjectThumbnailSnapshotControllerOptions = {
  dependencies?: {
    saveThumbnailSnapshot?: SaveThumbnailSnapshot
  }
  previewAssets: readonly ProjectPreviewAsset[]
  projectId: string
  revision: number
  visibleModelIds: readonly string[]
}

const defaultSaveThumbnailSnapshot: SaveThumbnailSnapshot = async (projectId, snapshot, revision) =>
  (
    await uploadProjectThumbnailSnapshot(projectId, snapshot.blob, {
      width: snapshot.width,
      height: snapshot.height,
      revision,
    })
  ).data.snapshot

export function useProjectThumbnailSnapshotController({
  dependencies,
  previewAssets,
  projectId,
  revision,
  visibleModelIds,
}: UseProjectThumbnailSnapshotControllerOptions) {
  const queryClient = useQueryClient()
  const lastRequestedSignatureRef = useRef('')
  const previewSignature = useMemo(() => projectPreviewAssetSignature(previewAssets), [previewAssets])
  const saveThumbnailSnapshot = dependencies?.saveThumbnailSnapshot ?? defaultSaveThumbnailSnapshot
  const { isPending, mutate } = useMutation({
    mutationFn: (snapshot: ModelPreviewSnapshotCapture) => saveThumbnailSnapshot(projectId, snapshot, revision),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const onSnapshotCapture = useCallback(
    (snapshot: ModelPreviewSnapshotCapture) => {
      const visibleSignature = visibleModelIds.join('|')
      if (!projectId || previewAssets.length === 0 || visibleModelIds.length === 0 || revision <= 0) {
        return
      }

      const signature = `${projectId}:${revision}:${previewSignature}:${visibleSignature}`
      if (lastRequestedSignatureRef.current === signature) {
        return
      }

      lastRequestedSignatureRef.current = signature
      mutate(snapshot)
    },
    [mutate, previewAssets.length, previewSignature, projectId, revision, visibleModelIds],
  )

  return {
    isPublishing: isPending,
    onSnapshotCapture,
  }
}
