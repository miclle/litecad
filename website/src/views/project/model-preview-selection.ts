import * as THREE from 'three'

export type LiteCADPreviewSelection = {
  modelID: string
  nodeID?: string
	occurrenceID?: string
}

export function findLiteCADSelectionFromObject(object: THREE.Object3D): LiteCADPreviewSelection | undefined {
  let currentObject: THREE.Object3D | null = object
  let modelID = ''
  let nodeID = ''
	let occurrenceID = ''

  while (currentObject) {
    if (!nodeID && typeof currentObject.userData.litecadNodeId === 'string') {
      nodeID = currentObject.userData.litecadNodeId
    }
    if (!modelID && typeof currentObject.userData.litecadModelId === 'string') {
      modelID = currentObject.userData.litecadModelId
    }
		if (!occurrenceID && typeof currentObject.userData.litecadOccurrenceId === 'string') {
			occurrenceID = currentObject.userData.litecadOccurrenceId
    }
    currentObject = currentObject.parent
  }

	return modelID ? { modelID, ...(nodeID ? { nodeID } : {}), ...(occurrenceID ? { occurrenceID } : {}) } : undefined
}
