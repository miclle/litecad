import * as THREE from 'three'

export type LiteCADPreviewSelection = {
  modelID: string
  nodeID?: string
}

export function findLiteCADSelectionFromObject(object: THREE.Object3D): LiteCADPreviewSelection | undefined {
  let currentObject: THREE.Object3D | null = object
  let modelID = ''
  let nodeID = ''

  while (currentObject) {
    if (!nodeID && typeof currentObject.userData.litecadNodeId === 'string') {
      nodeID = currentObject.userData.litecadNodeId
    }
    if (!modelID && typeof currentObject.userData.litecadModelId === 'string') {
      modelID = currentObject.userData.litecadModelId
    }
    if (modelID && nodeID) {
      return { modelID, nodeID }
    }
    currentObject = currentObject.parent
  }

  return modelID ? { modelID } : undefined
}
