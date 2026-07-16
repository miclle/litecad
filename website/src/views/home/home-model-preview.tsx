import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import * as THREE from 'three'
import WebGL from 'three/examples/jsm/capabilities/WebGL.js'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'

import {
  createAnimationFrameBatch,
  createHomePreviewEnvironment,
  disposeSceneResources,
} from './home-model-preview-resources'
import { ViewController } from 'src/views/project/view-controller'
import { configureModelPreviewTrackballControls } from 'src/views/project/model-preview-controls'
import { modelPreviewViewportBackground } from 'src/views/project/model-preview-grid'
import { createViewOrientationChangeEvent, orientationFromEvent, setViewEventName } from 'src/views/project/view-events'
import {
  cameraToOrientation,
  easeOutCubic,
  initialViewOrientation,
  interpolateOrientation,
  orientationDistance,
  orientationToViewDirection,
  orientationToViewUp,
  viewOrientationAnimationDuration,
  type ViewOrientation,
} from 'src/views/project/view-orientation'
import { useProjectWorkbenchViewControls } from 'src/views/project/use-project-workbench-view-controls'

type HomeModelPreviewProps = {
  ariaLabel: string
  descriptionBody: string
  descriptionId: string
  descriptionTitle: string
}

type HomeModelPreviewErrorBoundaryProps = {
  children: ReactNode
  fallback: ReactNode
}

type HomeModelPreviewErrorBoundaryState = {
  failed: boolean
}

let cachedWebGLAvailability: boolean | undefined

const isWebGLAvailable = () => {
  cachedWebGLAvailability ??= WebGL.isWebGL2Available()
  return cachedWebGLAvailability
}

class HomeModelPreviewErrorBoundary extends Component<
  HomeModelPreviewErrorBoundaryProps,
  HomeModelPreviewErrorBoundaryState
> {
  state: HomeModelPreviewErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): HomeModelPreviewErrorBoundaryState {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const fullTurn = Math.PI * 2

function createFlangeShape(outerRadius: number, innerRadius: number, boltRadius?: number) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outerRadius, 0, fullTurn, false)

  const centerHole = new THREE.Path()
  centerHole.absarc(0, 0, innerRadius, 0, fullTurn, true)
  shape.holes.push(centerHole)

  if (boltRadius !== undefined) {
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * fullTurn
      const boltHole = new THREE.Path()
      boltHole.absarc(Math.cos(angle) * 1.68, Math.sin(angle) * 1.68, boltRadius, 0, fullTurn, true)
      shape.holes.push(boltHole)
    }
  }

  return shape
}

function createHomeMechanicalModel() {
  const model = new THREE.Group()
  model.name = 'home-mechanical-flange'

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x66786f, metalness: 0.42, roughness: 0.48 })
  const machinedMaterial = new THREE.MeshStandardMaterial({ color: 0xb9b6aa, metalness: 0.82, roughness: 0.28 })
  const fastenerMaterial = new THREE.MeshStandardMaterial({ color: 0x35413c, metalness: 0.76, roughness: 0.32 })
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x26322d, opacity: 0.58, transparent: true })

  const flangeGeometry = new THREE.ExtrudeGeometry(createFlangeShape(2.42, 0.82, 0.2), {
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.07,
    bevelThickness: 0.08,
    curveSegments: 48,
    depth: 0.48,
    steps: 1,
  })
  flangeGeometry.translate(0, 0, -0.24)
  const flange = new THREE.Mesh(flangeGeometry, bodyMaterial)
  flange.name = 'flange-body'
  flange.castShadow = true
  model.add(flange)
  model.add(new THREE.LineSegments(new THREE.EdgesGeometry(flangeGeometry, 28), edgeMaterial))

  const hubGeometry = new THREE.ExtrudeGeometry(createFlangeShape(1.3, 0.82), {
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.06,
    bevelThickness: 0.08,
    curveSegments: 48,
    depth: 1.08,
    steps: 1,
  })
  hubGeometry.translate(0, 0, 0.12)
  const hub = new THREE.Mesh(hubGeometry, bodyMaterial)
  hub.name = 'bearing-hub'
  hub.castShadow = true
  model.add(hub)
  model.add(new THREE.LineSegments(new THREE.EdgesGeometry(hubGeometry, 28), edgeMaterial))

  const axleGeometry = new THREE.CylinderGeometry(0.56, 0.56, 2.55, 48)
  axleGeometry.rotateX(Math.PI / 2)
  const axle = new THREE.Mesh(axleGeometry, machinedMaterial)
  axle.name = 'machined-axle'
  axle.position.z = 0.46
  axle.castShadow = true
  model.add(axle)

  const bearing = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.16, 16, 64), machinedMaterial)
  bearing.name = 'bearing-ring'
  bearing.position.z = 1.24
  bearing.castShadow = true
  model.add(bearing)

  const boltGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 6)
  const bolts = new THREE.InstancedMesh(boltGeometry, fastenerMaterial, 6)
  bolts.name = 'flange-fasteners'
  bolts.castShadow = true
  const boltTransform = new THREE.Object3D()
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * fullTurn
    boltTransform.position.set(Math.cos(angle) * 1.68, Math.sin(angle) * 1.68, 0.34)
    boltTransform.rotation.set(Math.PI / 2, 0, angle)
    boltTransform.updateMatrix()
    bolts.setMatrixAt(index, boltTransform.matrix)
  }
  bolts.instanceMatrix.needsUpdate = true
  model.add(bolts)

  const washerGeometry = new THREE.TorusGeometry(0.24, 0.035, 8, 24)
  const washers = new THREE.InstancedMesh(washerGeometry, machinedMaterial, 6)
  washers.name = 'flange-washers'
  washers.castShadow = true
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * fullTurn
    boltTransform.position.set(Math.cos(angle) * 1.68, Math.sin(angle) * 1.68, 0.52)
    boltTransform.rotation.set(0, 0, 0)
    boltTransform.updateMatrix()
    washers.setMatrixAt(index, boltTransform.matrix)
  }
  washers.instanceMatrix.needsUpdate = true
  model.add(washers)

  model.rotation.set(-0.14, 0.16, -0.08)
  return model
}

function HomeModelPreviewScene({ ariaLabel, descriptionBody, descriptionId, descriptionTitle }: HomeModelPreviewProps) {
  const [hasInteracted, setHasInteracted] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewControls = useProjectWorkbenchViewControls()

  useEffect(() => {
    const container = containerRef.current
    const root = rootRef.current
    if (!container || !root) {
      return undefined
    }

    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true, preserveDrawingBuffer: true })
    renderer.setClearColor(modelPreviewViewportBackground, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.backgroundColor = '#f8fafc'
    renderer.domElement.tabIndex = 0
    renderer.domElement.setAttribute('role', 'img')
    container.appendChild(renderer.domElement)

    const model = createHomeMechanicalModel()
    const environment = createHomePreviewEnvironment(model)
    const scene = environment.scene
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 2000)
    const viewTarget = environment.center
    const initialViewDistance = environment.radius * 4.5
    camera.position.copy(orientationToViewDirection(initialViewOrientation).multiplyScalar(initialViewDistance).add(viewTarget))
    camera.up.copy(orientationToViewUp(initialViewOrientation))
    camera.lookAt(viewTarget)

    scene.add(new THREE.AmbientLight(0xdfe6d7, 2.4))
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5f685d, 1.2))

    const keyLight = new THREE.DirectionalLight(0xf3ead2, 1.8)
    keyLight.position.set(5, 7, 4)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xd7dfcc, 2.4)
    fillLight.position.set(-4, 3, -5)
    scene.add(fillLight)

    const cameraLight = new THREE.DirectionalLight(0xffffff, 1.2)
    camera.add(cameraLight)
    scene.add(camera)

    const controls = new TrackballControls(camera, renderer.domElement)
    configureModelPreviewTrackballControls(controls)
    controls.minDistance = Math.max(environment.radius * 0.8, 0.25)
    controls.maxDistance = Math.max(environment.radius * 80, initialViewDistance * 10)
    controls.target.copy(viewTarget)
    controls.update()

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let activeOrientation = initialViewOrientation
    let controlsFrameID: number | null = null
    let isControlsInteracting = false
    let suppressControlsChange = false
    let viewAnimationFrameID: number | null = null
    const renderScene = () => {
      const viewDistance = camera.position.distanceTo(controls.target)
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.near = viewDistance * 0.78
        scene.fog.far = viewDistance + environment.radius * 24
      }
      renderer.render(scene, camera)
    }
    const markInteracted = () => {
      setHasInteracted(true)
      root.dataset.interacted = 'true'
    }
    const cancelControlsUpdate = () => {
      isControlsInteracting = false
      if (controlsFrameID === null) {
        return
      }
      window.cancelAnimationFrame(controlsFrameID)
      controlsFrameID = null
    }
    const cancelViewAnimation = () => {
      if (viewAnimationFrameID === null) {
        return
      }
      window.cancelAnimationFrame(viewAnimationFrameID)
      viewAnimationFrameID = null
      activeOrientation = cameraToOrientation(camera, controls.target)
    }
    const emitOrientation = () => {
      window.dispatchEvent(createViewOrientationChangeEvent(cameraToOrientation(camera, controls.target)))
    }
    const orientationSync = createAnimationFrameBatch(emitOrientation)
    const updateControls = () => {
      controls.update()
      if (isControlsInteracting) {
        controlsFrameID = window.requestAnimationFrame(updateControls)
        return
      }
      controlsFrameID = null
    }
    const updateControlsWithoutScheduling = () => {
      suppressControlsChange = true
      controls.update()
      suppressControlsChange = false
    }
    const updateCameraForOrientation = (width: number, height: number, orientation: ViewOrientation) => {
      const direction = orientationToViewDirection(orientation)
      const frameSize = environment.radius * (width < 640 ? 3.9 : 3.35)
      const distance = Math.max(
        frameSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)),
        environment.radius * 4.5,
      )

      controls.target.copy(environment.center)
      camera.position.copy(environment.center).add(direction.multiplyScalar(distance))
      camera.up.copy(orientationToViewUp(orientation))
      camera.aspect = width / Math.max(height, 1)
      camera.near = Math.max(environment.radius / 800, 0.01)
      camera.far = Math.max(distance + environment.radius * 120, 2000)
      controls.minDistance = Math.max(environment.radius * 0.8, 0.25)
      controls.maxDistance = Math.max(environment.radius * 80, distance * 10)
      camera.lookAt(environment.center)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      updateControlsWithoutScheduling()
    }
    const animateOrientation = (orientation: ViewOrientation) => {
      const { clientHeight, clientWidth } = container
      if (clientHeight === 0 || clientWidth === 0) {
        return
      }
      cancelViewAnimation()
      orientationSync.cancel()
      markInteracted()
      const startOrientation = activeOrientation
      activeOrientation = orientation
      if (reducedMotion.matches || orientationDistance(startOrientation, orientation) < 0.2) {
        updateCameraForOrientation(clientWidth, clientHeight, orientation)
        renderScene()
        emitOrientation()
        return
      }
      const startedAt = performance.now()
      const step = (now: number) => {
        const progress = Math.min((now - startedAt) / viewOrientationAnimationDuration, 1)
        updateCameraForOrientation(
          clientWidth,
          clientHeight,
          interpolateOrientation(startOrientation, orientation, easeOutCubic(progress)),
        )
        renderScene()
        if (progress < 1) {
          viewAnimationFrameID = window.requestAnimationFrame(step)
          return
        }
        viewAnimationFrameID = null
        updateCameraForOrientation(clientWidth, clientHeight, orientation)
        renderScene()
        emitOrientation()
      }
      viewAnimationFrameID = window.requestAnimationFrame(step)
    }
    const handleSetView = (event: Event) => {
      const orientation = orientationFromEvent(event)
      if (orientation) {
        animateOrientation(orientation)
      }
    }
    const handleControlsStart = () => {
      cancelViewAnimation()
      orientationSync.cancel()
      markInteracted()
      isControlsInteracting = true
      controls.update()
      if (controlsFrameID === null) {
        controlsFrameID = window.requestAnimationFrame(updateControls)
      }
    }
    const handleControlsChange = () => {
      if (suppressControlsChange) {
        return
      }
      activeOrientation = cameraToOrientation(camera, controls.target)
      renderScene()
      orientationSync.schedule()
    }
    const handleControlsEnd = () => {
      isControlsInteracting = false
    }
    const handleKeyboardOrbit = (event: KeyboardEvent) => {
      const horizontal = event.key === 'ArrowLeft' ? -0.14 : event.key === 'ArrowRight' ? 0.14 : 0
      const vertical = event.key === 'ArrowUp' ? -0.1 : event.key === 'ArrowDown' ? 0.1 : 0
      if (horizontal === 0 && vertical === 0) {
        return
      }
      event.preventDefault()
      cancelViewAnimation()
      orientationSync.cancel()
      markInteracted()
      const offset = camera.position.clone().sub(controls.target)
      const spherical = new THREE.Spherical().setFromVector3(offset)
      spherical.theta += horizontal
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + vertical, Math.PI * 0.18, Math.PI * 0.82)
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical))
      camera.lookAt(controls.target)
      updateControlsWithoutScheduling()
      activeOrientation = cameraToOrientation(camera, controls.target)
      renderScene()
      emitOrientation()
    }

    controls.addEventListener('start', handleControlsStart)
    controls.addEventListener('change', handleControlsChange)
    controls.addEventListener('end', handleControlsEnd)
    renderer.domElement.addEventListener('pointerdown', markInteracted)
    renderer.domElement.addEventListener('keydown', handleKeyboardOrbit)
    root.addEventListener(setViewEventName, handleSetView)

    const resize = () => {
      const { clientHeight, clientWidth } = container
      if (clientHeight === 0 || clientWidth === 0) {
        return
      }
      renderer.setSize(clientWidth, clientHeight)
      controls.handleResize()
      updateCameraForOrientation(clientWidth, clientHeight, activeOrientation)
      renderScene()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    return () => {
      cancelControlsUpdate()
      orientationSync.cancel()
      cancelViewAnimation()
      resizeObserver.disconnect()
      controls.removeEventListener('start', handleControlsStart)
      controls.removeEventListener('change', handleControlsChange)
      controls.removeEventListener('end', handleControlsEnd)
      renderer.domElement.removeEventListener('pointerdown', markInteracted)
      renderer.domElement.removeEventListener('keydown', handleKeyboardOrbit)
      root.removeEventListener(setViewEventName, handleSetView)
      controls.dispose()
      disposeSceneResources(scene)
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  useEffect(() => {
    const canvas = containerRef.current?.querySelector('canvas')
    if (!canvas) {
      return
    }
    canvas.setAttribute('aria-describedby', descriptionId)
    canvas.setAttribute('aria-label', ariaLabel)
  }, [ariaLabel, descriptionId])

  return (
    <div
      ref={rootRef}
      aria-label={ariaLabel}
      className="absolute inset-0 z-[1] cursor-grab active:cursor-grabbing"
      data-home-model-preview
      data-interacted={hasInteracted ? 'true' : 'false'}
      data-model-preview
      role="region"
    >
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-4 right-4 top-4 z-20 rounded-md border border-[#d8cfbc] bg-[#fcfaf3]/90 p-3 backdrop-blur sm:right-auto sm:max-w-sm sm:p-4">
        <p className="font-mono text-xs uppercase text-[#7a6c52]">{descriptionTitle}</p>
        <p id={descriptionId} className="mt-2 text-xs leading-5 text-[#303329] sm:text-sm sm:leading-6">
          {descriptionBody}
        </p>
      </div>
      <ViewController
        animateViewCubeOrientation={viewControls.animateViewCubeOrientation}
        onFlip={viewControls.flipCanvasOrientation}
        onResetIsometric={() => viewControls.applyCanvasOrientation(initialViewOrientation)}
        onSetOrientation={viewControls.applyCanvasOrientation}
        onStep={viewControls.stepCanvasOrientation}
        orientation={viewControls.viewOrientation}
      />
    </div>
  )
}

function HomeModelPreviewUnavailable() {
  const { t } = useTranslation()

  return (
    <div
      className="absolute inset-0 z-[1] flex items-center justify-center p-5"
      data-home-model-preview-unavailable
      role="status"
    >
      <div className="max-w-sm rounded-md border border-[#d8cfbc] bg-[#fcfaf3]/92 p-4 text-center shadow-sm backdrop-blur">
        <p className="font-mono text-xs uppercase text-[#7a6c52]">{t('home.modelPreviewUnavailableTitle')}</p>
        <p className="mt-2 text-sm leading-6 text-[#55594f]">{t('home.modelPreviewUnavailableBody')}</p>
      </div>
    </div>
  )
}

function HomeModelPreview(props: HomeModelPreviewProps) {
  const fallback = <HomeModelPreviewUnavailable />

  if (!isWebGLAvailable()) {
    return fallback
  }

  return (
    <HomeModelPreviewErrorBoundary fallback={fallback}>
      <HomeModelPreviewScene {...props} />
    </HomeModelPreviewErrorBoundary>
  )
}

export default HomeModelPreview
