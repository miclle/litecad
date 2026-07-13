import { useState } from 'react'

export function useProjectWorkbenchVisibilityState() {
  const [hiddenModelIDs, setHiddenModelIDs] = useState<Set<string>>(() => new Set())

  const toggleModelVisibility = (modelID: string) => {
    setHiddenModelIDs((currentIDs) => {
      const nextIDs = new Set(currentIDs)
      if (nextIDs.has(modelID)) {
        nextIDs.delete(modelID)
      } else {
        nextIDs.add(modelID)
      }
      return nextIDs
    })
  }

  return {
    hiddenModelIDs,
    toggleModelVisibility,
  }
}
