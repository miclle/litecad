import * as THREE from 'three'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'
import { describe, expect, it } from 'vitest'

import { configureModelPreviewTrackballControls } from './model-preview-controls'

describe('model preview TrackballControls', () => {
  it('shares the same immediate CAD navigation settings across preview surfaces', () => {
    const controls = new TrackballControls(new THREE.PerspectiveCamera(), document.createElement('canvas'))

    configureModelPreviewTrackballControls(controls)

    expect(controls.staticMoving).toBe(true)
    expect(controls.noPan).toBe(false)
    expect(controls.noZoom).toBe(false)
    expect(controls.rotateSpeed).toBe(2.4)
    expect(controls.panSpeed).toBe(0.35)
    expect(controls.zoomSpeed).toBe(4.2)
    controls.dispose()
  })
})
