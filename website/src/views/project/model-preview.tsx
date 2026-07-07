import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'

import { disposeObject3DResources } from './three-object-resources'
import { orientCADPreviewObject } from './model-preview-orientation'
import { viewAxisDefinitions } from './view-axis'
import {
  createViewOrientationChangeEvent,
  orientationFromEvent,
  resetViewEventName,
  setViewEventName,
} from './view-events'
import {
  cameraToOrientation,
  easeOutCubic,
  initialViewOrientation,
  interpolateOrientation,
  orientationDistance,
  orientationToViewDirection,
  viewOrientationAnimationDuration,
  type ViewOrientation,
} from './view-orientation'
import { projectPreviewAssetSignature, type ProjectPreviewAsset } from './project-preview-assets'

type ModelPreviewProps = {
  deferResize?: boolean
  previewAssets?: ProjectPreviewAsset[]
}

type ZoomHUDState = {
  percent: number
  visible: boolean
}

const viewportBackground = 0xf8fafc
const gridPlaneOffset = 0.015
const modelPreviewZoomSpeed = 4.2
const modelPreviewZoomHUDHideDelayMS = 1000
const modelPreviewZoomDistanceEpsilonRatio = 0.002
const modelPreviewResizeCompleteEventName = 'litecad:model-preview-resize-complete'

const niceGridStep = (radius: number) => {
  const targetStep = Math.max(radius / 10, 0.01)
  const magnitude = 10 ** Math.floor(Math.log10(targetStep))
  const normalized = targetStep / magnitude
  if (normalized <= 1) {
    return magnitude
  }
  if (normalized <= 2) {
    return magnitude * 2
  }
  if (normalized <= 5) {
    return magnitude * 5
  }
  return magnitude * 10
}

const createGridLineGeometry = (size: number, step: number, shouldIncludeLine: (index: number) => boolean) => {
  const positions: number[] = []
  const lineCount = Math.floor(size / step)

  for (let index = -lineCount; index <= lineCount; index += 1) {
    if (!shouldIncludeLine(index)) {
      continue
    }
    const position = index * step
    positions.push(-size, 0, position, size, 0, position)
    positions.push(position, 0, -size, position, 0, size)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

const createWorldGrid = (radius: number) => {
  const minorStep = niceGridStep(radius)
  const gridSize = minorStep * 180
  const group = new THREE.Group()
  group.name = 'Perspective CAD grid'

  const minorGrid = new THREE.LineSegments(
    createGridLineGeometry(gridSize, minorStep, (index) => index % 5 !== 0),
    new THREE.LineBasicMaterial({
      color: 0xb7c4d1,
      fog: true,
      opacity: 0.52,
      transparent: true,
      depthWrite: false,
    }),
  )
  minorGrid.renderOrder = -2
  group.add(minorGrid)

  const majorGrid = new THREE.LineSegments(
    createGridLineGeometry(gridSize, minorStep, (index) => index % 5 === 0),
    new THREE.LineBasicMaterial({
      color: 0x7f8fa3,
      fog: true,
      opacity: 0.58,
      transparent: true,
      depthWrite: false,
    }),
  )
  majorGrid.renderOrder = -1
  group.add(majorGrid)

  const axisSize = gridSize * 1.04
  const xAxis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-axisSize, 0, 0), new THREE.Vector3(axisSize, 0, 0)]),
    new THREE.LineBasicMaterial({
      color: 0xe57373,
      fog: true,
      opacity: 0.64,
      transparent: true,
      depthWrite: false,
    }),
  )
  xAxis.renderOrder = 0
  group.add(xAxis)

  const zAxis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -axisSize), new THREE.Vector3(0, 0, axisSize)]),
    new THREE.LineBasicMaterial({
      color: 0x6aa875,
      fog: true,
      opacity: 0.66,
      transparent: true,
      depthWrite: false,
    }),
  )
  zAxis.renderOrder = 0
  group.add(zAxis)

  return group
}

const previewMaterialColors = [0xb6c0b8, 0xc4b78a, 0x9fb6c8, 0xc7a0a0, 0xa8bea0]

export function ModelPreview({ deferResize = false, previewAssets = [] }: ModelPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const deferResizeRef = useRef(deferResize)
  const zoomHUDHideTimeoutRef = useRef<number | undefined>(undefined)
  const [zoomHUD, setZoomHUD] = useState<ZoomHUDState>({ percent: 100, visible: false })
  const previewAssetSignature = useMemo(() => projectPreviewAssetSignature(previewAssets), [previewAssets])
  const clearZoomHUDHideTimeout = () => {
    if (zoomHUDHideTimeoutRef.current !== undefined) {
      window.clearTimeout(zoomHUDHideTimeoutRef.current)
      zoomHUDHideTimeoutRef.current = undefined
    }
  }
  const hideZoomHUD = () => {
    clearZoomHUDHideTimeout()
    setZoomHUD((currentHUD) => (currentHUD.visible ? { ...currentHUD, visible: false } : currentHUD))
  }

  useEffect(() => {
    deferResizeRef.current = deferResize

    if (!deferResize) {
      containerRef.current?.dispatchEvent(new Event(modelPreviewResizeCompleteEventName))
    }
  }, [deferResize])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return undefined
    }
    hideZoomHUD()

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(viewportBackground, 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.position = 'absolute'
    renderer.domElement.style.inset = '0'
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.zIndex = '1'
    renderer.domElement.style.backgroundColor = '#f8fafc'
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(viewportBackground)
    scene.fog = new THREE.Fog(viewportBackground, 40, 520)

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 2000)
    camera.position.set(8, 6.5, 10)

    const controls = new TrackballControls(camera, renderer.domElement)
    controls.staticMoving = true
    controls.noPan = false
    controls.noZoom = false
    controls.rotateSpeed = 2.4
    controls.panSpeed = 0.35
    controls.zoomSpeed = modelPreviewZoomSpeed
    controls.minDistance = 1
    controls.maxDistance = 1000
    controls.target.set(0, 0.15, 0)
    let activeOrientation = initialViewOrientation
    let lastEmittedOrientation = initialViewOrientation
    let viewAnimationFrameID: number | null = null
    let controlsFrameID: number | null = null
    let isControlsInteracting = false
    let isProgrammaticCameraUpdate = false
    const previewCenter = new THREE.Vector3(0, 0, 0)
    let previewRadius = 4
    let fitViewDistance = camera.position.distanceTo(controls.target)
    let lastZoomDistance = fitViewDistance
    const previewGroup = new THREE.Group()
    previewGroup.name = 'Project preview models'
    let isDisposed = false
    let worldGrid = createWorldGrid(previewRadius)
    scene.add(worldGrid)
    scene.add(previewGroup)
    const updateWorldGrid = (bounds?: THREE.Box3) => {
      scene.remove(worldGrid)
      disposeObject3DResources(worldGrid)
      worldGrid = createWorldGrid(previewRadius)
      if (bounds) {
        worldGrid.position.set(previewCenter.x, bounds.min.y - previewRadius * gridPlaneOffset, previewCenter.z)
      } else {
        worldGrid.position.y = -previewRadius * gridPlaneOffset
      }
      scene.add(worldGrid)
    }
    const updateSceneFog = (viewDistance: number) => {
      const nextNear = viewDistance * 0.78
      const nextFar = viewDistance + previewRadius * 24
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.near = nextNear
        scene.fog.far = nextFar
        return
      }
      scene.fog = new THREE.Fog(viewportBackground, nextNear, nextFar)
    }
    const renderScene = () => {
      updateSceneFog(camera.position.distanceTo(controls.target))
      renderer.render(scene, camera)
    }
    const emitOrientationChange = (orientation: ViewOrientation) => {
      if (orientationDistance(lastEmittedOrientation, orientation) < 0.2) {
        return
      }
      lastEmittedOrientation = orientation
      window.dispatchEvent(createViewOrientationChangeEvent(orientation))
    }
    const scheduleZoomHUDHide = () => {
      clearZoomHUDHideTimeout()
      zoomHUDHideTimeoutRef.current = window.setTimeout(() => {
        setZoomHUD((currentHUD) => (currentHUD.visible ? { ...currentHUD, visible: false } : currentHUD))
        zoomHUDHideTimeoutRef.current = undefined
      }, modelPreviewZoomHUDHideDelayMS)
    }
    const showZoomHUD = (viewDistance: number) => {
      if (fitViewDistance <= 0 || viewDistance <= 0) {
        return
      }
      setZoomHUD({
        percent: Math.max(1, Math.round((fitViewDistance / viewDistance) * 100)),
        visible: true,
      })
      scheduleZoomHUDHide()
    }
    const syncZoomHUD = () => {
      const viewDistance = camera.position.distanceTo(controls.target)
      const distanceEpsilon = Math.max(previewRadius * modelPreviewZoomDistanceEpsilonRatio, 0.002)
      if (Math.abs(viewDistance - lastZoomDistance) < distanceEpsilon) {
        return
      }
      lastZoomDistance = viewDistance
      showZoomHUD(viewDistance)
    }
    const handleControlsChange = () => {
      if (isProgrammaticCameraUpdate) {
        return
      }
      activeOrientation = cameraToOrientation(camera, controls.target)
      emitOrientationChange(activeOrientation)
      syncZoomHUD()
      renderScene()
    }
    controls.addEventListener('change', handleControlsChange)

    const updateControls = () => {
      controls.update()
      if (isControlsInteracting) {
        controlsFrameID = window.requestAnimationFrame(updateControls)
        return
      }
      controlsFrameID = null
    }
    const startControlsInteraction = () => {
      cancelViewAnimation()
      isControlsInteracting = true
      controls.update()
      if (controlsFrameID === null) {
        controlsFrameID = window.requestAnimationFrame(updateControls)
      }
    }
    const stopControlsInteraction = () => {
      isControlsInteracting = false
    }
    const cancelControlsUpdate = () => {
      isControlsInteracting = false
      if (controlsFrameID === null) {
        return
      }
      window.cancelAnimationFrame(controlsFrameID)
      controlsFrameID = null
    }

    const ambient = new THREE.AmbientLight(0xdfe6d7, 2.4)
    scene.add(ambient)

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x5f685d, 1.2)
    scene.add(hemiLight)

    const keyLight = new THREE.DirectionalLight(0xf3ead2, 1.8)
    keyLight.position.set(5, 7, 4)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xd7dfcc, 2.4)
    fillLight.position.set(-4, 3, -5)
    scene.add(fillLight)

    const cameraLight = new THREE.DirectionalLight(0xffffff, 1.2)
    camera.add(cameraLight)
    scene.add(camera)

    const createAxisLabel = (label: string, color: number) => {
      const canvas = document.createElement('canvas')
      canvas.width = 96
      canvas.height = 96
      const context = canvas.getContext('2d')
      if (context) {
        context.font = '700 42px ui-monospace, SFMono-Regular, Menlo, monospace'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.lineWidth = 5
        context.strokeStyle = '#ffffff'
        context.fillStyle = `#${color.toString(16).padStart(6, '0')}`
        context.strokeText(label, 48, 50)
        context.fillText(label, 48, 50)
      }
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }))
      sprite.scale.set(0.36, 0.36, 1)
      sprite.renderOrder = 3
      return sprite
    }

    const createAxis = (label: string, direction: THREE.Vector3, color: number) => {
      const axis = new THREE.Group()
      const normalizedDirection = direction.clone().normalize()
      const axisLength = 2.8
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        normalizedDirection.clone().multiplyScalar(axisLength),
      ])
      axis.add(new THREE.Line(geometry, material))

      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.22, 28),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
      )
      arrow.position.copy(normalizedDirection.clone().multiplyScalar(axisLength))
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalizedDirection)
      axis.add(arrow)

      const labelSprite = createAxisLabel(label, color)
      labelSprite.position.copy(normalizedDirection.clone().multiplyScalar(axisLength + 0.32))
      axis.add(labelSprite)

      return axis
    }

    const axesGroup = new THREE.Group()
    axesGroup.position.set(-2.2, -0.48, -1.65)
    for (const axis of viewAxisDefinitions) {
      axesGroup.add(createAxis(axis.label, axis.direction, axis.color))
    }
    scene.add(axesGroup)

    const createCADPreviewMaterial = (name = '', assetIndex = 0) => {
      const normalizedName = name.toLowerCase()
      const isGlass = normalizedName.includes('lcd') || normalizedName.includes('glass') || name.includes('玻璃')
      if (isGlass) {
        return new THREE.MeshStandardMaterial({
          color: 0x394966,
          opacity: 0.38,
          roughness: 0.36,
          metalness: 0.02,
          transparent: true,
          depthWrite: false,
          flatShading: true,
          side: THREE.DoubleSide,
        })
      }
      return new THREE.MeshStandardMaterial({
        color: previewMaterialColors[assetIndex % previewMaterialColors.length],
        roughness: 0.8,
        metalness: 0.04,
        flatShading: true,
        side: THREE.DoubleSide,
      })
    }

    const updatePreviewBounds = () => {
      const bounds = new THREE.Box3().setFromObject(previewGroup)
      if (bounds.isEmpty()) {
        previewCenter.set(0, 0, 0)
        previewRadius = 4
        updateWorldGrid()
        resetView()
        return
      }
      const sphere = new THREE.Sphere()
      bounds.getBoundingSphere(sphere)
      previewCenter.copy(sphere.center)
      previewRadius = Math.max(sphere.radius, 1)
      updateWorldGrid(bounds)
      resetView()
    }

    const addPreviewObject = (asset: ProjectPreviewAsset, assetIndex: number, object: THREE.Object3D) => {
      if (isDisposed) {
        disposeObject3DResources(object)
        return
      }
      object.name = asset.name
      if (asset.previewFormat === 'obj') {
        orientCADPreviewObject(object)
      }
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const objectName = `${child.name} ${child.parent?.name ?? ''}`
          if (asset.previewFormat === 'obj') {
            child.material = createCADPreviewMaterial(`${asset.name} ${objectName}`, assetIndex)
          } else if (child.material instanceof THREE.Material) {
            child.material.side = THREE.DoubleSide
            child.material.needsUpdate = true
          }
          child.castShadow = false
          child.receiveShadow = false
        } else if (child instanceof THREE.Line) {
          child.material = new THREE.LineBasicMaterial({
            color: 0x64748b,
            transparent: true,
            opacity: 0.5,
            depthTest: false,
          })
          child.renderOrder = 10
        }
      })
      previewGroup.add(object)
      updatePreviewBounds()
    }

    previewAssets.forEach((asset, assetIndex) => {
      if (asset.previewFormat === 'obj') {
        new OBJLoader().load(asset.previewUrl, (object) => addPreviewObject(asset, assetIndex, object))
      } else if (asset.previewFormat === 'glb' || asset.previewFormat === 'gltf') {
        new GLTFLoader().load(asset.previewUrl, (gltf) => addPreviewObject(asset, assetIndex, gltf.scene))
      }
    })

    renderer.domElement.style.cursor = 'grab'

    const updateCameraForOrientation = (width: number, height: number, orientation: ViewOrientation) => {
      const direction = orientationToViewDirection(orientation)
      const up = orientation.up
        ? new THREE.Vector3(...orientation.up).normalize()
        : new THREE.Vector3(
            ...(Math.abs(direction.y) > 0.98
              ? ([0, 0, direction.y > 0 ? -1 : 1] as [number, number, number])
              : ([0, 1, 0] as [number, number, number])),
          )
      const aspect = width / Math.max(height, 1)
      const frameSize = previewRadius * (width < 640 ? 3.9 : 3.35)
      const distance = Math.max(
        frameSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)),
        previewRadius * 4.5,
      )

      isProgrammaticCameraUpdate = true
      controls.target.copy(previewCenter)
      camera.up.copy(up)
      camera.position.copy(previewCenter).add(direction.multiplyScalar(distance))
      camera.aspect = aspect
      camera.near = Math.max(previewRadius / 800, 0.01)
      camera.far = Math.max(distance + previewRadius * 120, 2000)
      updateSceneFog(distance)
      controls.minDistance = Math.max(previewRadius * 0.8, 0.25)
      controls.maxDistance = Math.max(previewRadius * 80, distance * 10)
      camera.lookAt(previewCenter)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      controls.update()
      isProgrammaticCameraUpdate = false
      fitViewDistance = distance
      lastZoomDistance = distance
    }

    const cancelViewAnimation = () => {
      if (viewAnimationFrameID === null) {
        return
      }
      window.cancelAnimationFrame(viewAnimationFrameID)
      viewAnimationFrameID = null
      activeOrientation = cameraToOrientation(camera, controls.target)
      lastEmittedOrientation = activeOrientation
      window.dispatchEvent(createViewOrientationChangeEvent(activeOrientation))
    }

    const fitCameraToModel = (width: number, height: number) => {
      updateCameraForOrientation(width, height, activeOrientation)
    }

    const setRendererSize = (width: number, height: number) => {
      renderer.setSize(width, height)
      controls.handleResize()
    }

    const animateViewOrientation = (nextOrientation: ViewOrientation) => {
      const { width, height } = container.getBoundingClientRect()
      if (width === 0 || height === 0) {
        return
      }
      setRendererSize(width, height)
      cancelViewAnimation()
      const startOrientation = activeOrientation
      activeOrientation = nextOrientation
      lastEmittedOrientation = nextOrientation
      if (orientationDistance(startOrientation, nextOrientation) < 0.2) {
        updateCameraForOrientation(width, height, nextOrientation)
        renderScene()
        return
      }
      const startedAt = performance.now()
      const step = (now: number) => {
        const progress = Math.min((now - startedAt) / viewOrientationAnimationDuration, 1)
        updateCameraForOrientation(
          width,
          height,
          interpolateOrientation(startOrientation, nextOrientation, easeOutCubic(progress)),
        )
        renderScene()
        if (progress < 1) {
          viewAnimationFrameID = window.requestAnimationFrame(step)
          return
        }
        viewAnimationFrameID = null
        updateCameraForOrientation(width, height, nextOrientation)
        renderScene()
      }
      viewAnimationFrameID = window.requestAnimationFrame(step)
    }

    const resetView = () => {
      const { width, height } = container.getBoundingClientRect()
      if (width === 0 || height === 0) {
        return
      }
      cancelViewAnimation()
      setRendererSize(width, height)
      fitCameraToModel(width, height)
      renderScene()
    }

    let hasDeferredResize = false
    const resize = () => {
      if (deferResizeRef.current) {
        hasDeferredResize = true
        return
      }

      hasDeferredResize = false
      resetView()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resetView()
    const resetFrameID = window.requestAnimationFrame(resetView)
    const resetTimeoutID = window.setTimeout(resetView, 250)

    const handleResetView = () => resetView()
    const handleDeferredResizeComplete = () => {
      if (!hasDeferredResize) {
        return
      }

      hasDeferredResize = false
      resetView()
    }
    const handlePageShow = () => resetView()
    const handleSetView = (event: Event) => {
      const orientation = orientationFromEvent(event)
      if (!orientation) {
        return
      }
      animateViewOrientation(orientation)
    }
    container.addEventListener(resetViewEventName, handleResetView)
    container.addEventListener(modelPreviewResizeCompleteEventName, handleDeferredResizeComplete)
    container.addEventListener(setViewEventName, handleSetView)
    window.addEventListener('pageshow', handlePageShow)
    controls.addEventListener('start', startControlsInteraction)
    controls.addEventListener('end', stopControlsInteraction)

    return () => {
      cancelViewAnimation()
      cancelControlsUpdate()
      window.cancelAnimationFrame(resetFrameID)
      window.clearTimeout(resetTimeoutID)
      clearZoomHUDHideTimeout()
      resizeObserver.disconnect()
      container.removeEventListener(resetViewEventName, handleResetView)
      container.removeEventListener(modelPreviewResizeCompleteEventName, handleDeferredResizeComplete)
      container.removeEventListener(setViewEventName, handleSetView)
      window.removeEventListener('pageshow', handlePageShow)
      controls.removeEventListener('start', startControlsInteraction)
      controls.removeEventListener('end', stopControlsInteraction)
      controls.removeEventListener('change', handleControlsChange)
      controls.dispose()
      isDisposed = true
      scene.remove(previewGroup)
      disposeObject3DResources(scene)
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
    // The parent can re-render during view changes; only rebuild the Three.js scene when asset content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewAssetSignature])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden bg-[#f8fafc]"
      data-model-preview
      data-preview-asset-count={previewAssets.length}
    >
      <div
        aria-hidden={!zoomHUD.visible}
        className={`pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-md border border-[#d6dbe3] bg-white/92 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase text-[#475569] shadow-[0_10px_28px_rgba(15,23,42,0.08)] backdrop-blur transition duration-300 motion-reduce:transition-none ${
          zoomHUD.visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
        }`}
      >
        View {zoomHUD.percent}%
      </div>
    </div>
  )
}
