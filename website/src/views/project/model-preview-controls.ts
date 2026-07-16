import type { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'

export const configureModelPreviewTrackballControls = (controls: TrackballControls) => {
  controls.staticMoving = true
  controls.noPan = false
  controls.noZoom = false
  controls.rotateSpeed = 2.4
  controls.panSpeed = 0.35
  controls.zoomSpeed = 4.2
}
