import { useCallback, useMemo, useState } from 'react'

import type { CADDocumentNode, ProjectModel, ProjectParametricArtifact } from 'src/types/project'

export type CADTool = 'inspect' | 'fuse-box'

type UseProjectSelectionControllerOptions = {
  cadNodeByID: Map<string, CADDocumentNode>
  projectModels: ProjectModel[]
  sourceNodeIDByModelID: Map<string, string>
}

export function useProjectSelectionController({
  cadNodeByID,
  projectModels,
  sourceNodeIDByModelID,
}: UseProjectSelectionControllerOptions) {
  const [activeCADTool, setActiveCADTool] = useState<CADTool>('inspect')
  const [selectedArtifact, setSelectedArtifact] = useState<ProjectParametricArtifact | undefined>(undefined)
  const [selectedDocumentNodeID, setSelectedDocumentNodeID] = useState('')
  const [selectedModelID, setSelectedModelID] = useState('')

  const resetTool = useCallback(() => setActiveCADTool('inspect'), [])
  const clearSelection = useCallback(() => {
    setSelectedArtifact(undefined)
    setSelectedModelID('')
    setSelectedDocumentNodeID('')
    resetTool()
  }, [resetTool])
  const selectArtifact = useCallback(
    (artifact: ProjectParametricArtifact) => {
      setSelectedArtifact(artifact)
      setSelectedModelID('')
      setSelectedDocumentNodeID('')
      resetTool()
    },
    [resetTool],
  )
  const selectModel = useCallback(
    (modelID: string, nodeID?: string) => {
      setSelectedArtifact(undefined)
      setSelectedModelID(modelID)
      setSelectedDocumentNodeID(nodeID ?? sourceNodeIDByModelID.get(modelID) ?? `node_${modelID}`)
      resetTool()
    },
    [resetTool, sourceNodeIDByModelID],
  )

  const selectedModel = useMemo(
    () => projectModels.find((model) => model.id === selectedModelID),
    [projectModels, selectedModelID],
  )
  const effectiveSelectedModelID = selectedModel?.id ?? ''
  const effectiveSelectedDocumentNodeID = cadNodeByID.has(selectedDocumentNodeID)
    ? selectedDocumentNodeID
    : sourceNodeIDByModelID.get(effectiveSelectedModelID) ?? ''
  const selectedDocumentNode = effectiveSelectedDocumentNodeID ? cadNodeByID.get(effectiveSelectedDocumentNodeID) : undefined
  const selectedSourceModelID = selectedDocumentNode?.source_model_id || selectedDocumentNode?.model_id || effectiveSelectedModelID
  const selectedSourceModel = selectedSourceModelID ? projectModels.find((model) => model.id === selectedSourceModelID) : undefined

  return {
    activeCADTool,
    clearSelection,
    effectiveSelectedDocumentNodeID,
    effectiveSelectedModelID,
    resetTool,
    selectArtifact,
    selectModel,
    selectedArtifact,
    selectedDocumentNode,
    selectedDocumentNodeID,
    selectedModel,
    selectedModelID,
    selectedSourceModel,
    setActiveCADTool,
  }
}
