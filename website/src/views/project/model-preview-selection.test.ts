import { describe, expect, test } from 'vitest'
import * as THREE from 'three'

import { findLiteCADSelectionFromObject } from './model-preview-selection'

describe('model preview selection', () => {
  test('returns the nearest child document node for a raycast mesh', () => {
    const model = new THREE.Group()
    model.userData.litecadModelId = 'mdl_source'

    const component = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    component.userData.litecadModelId = 'mdl_source'
    component.userData.litecadNodeId = 'node_mdl_source_component_2'
    model.add(component)

    expect(findLiteCADSelectionFromObject(component)).toEqual({
      modelID: 'mdl_source',
      nodeID: 'node_mdl_source_component_2',
    })
  })

  test('keeps walking when the raycast mesh only has a model id', () => {
    const model = new THREE.Group()
    model.userData.litecadModelId = 'mdl_source'
    model.userData.litecadNodeId = 'node_mdl_source_component_1'

    const face = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    face.userData.litecadModelId = 'mdl_source'
    model.add(face)

    expect(findLiteCADSelectionFromObject(face)).toEqual({
      modelID: 'mdl_source',
      nodeID: 'node_mdl_source_component_1',
    })
  })
})
