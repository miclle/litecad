import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

import { disposeObject3DResources } from './three-object-resources'
import { createKernelMeshPreviewObject } from './model-preview-kernel-mesh'
import { orientCADPreviewObject } from './model-preview-orientation'
import {
  cadTranslationDeltaToPreviewTranslation,
  previewTranslationDeltaToCADTranslation,
} from './model-preview-transforms'
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
import { translationFromCADTransform, type CADTranslation } from './cad-document-transforms'

export type ModelPreviewSnapshotCapture = {
  blob: Blob
  width: number
  height: number
}

type ModelPreviewProps = {
  deferResize?: boolean
  draftModelTranslations?: Record<string, CADTranslation>
  modelTranslations?: Record<string, CADTranslation>
  onClearSelection?: () => void
  onModelTranslationChange?: (modelID: string, translation: CADTranslation) => void
  onSnapshotCapture?: (snapshot: ModelPreviewSnapshotCapture) => void
  onSelectModel?: (modelID: string) => void
  previewAssets?: ProjectPreviewAsset[]
  selectedModelId?: string
  variant?: 'workspace' | 'thumbnail'
  visibleModelIds?: readonly string[]
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
const modelPreviewSnapshotWidth = 640
const modelPreviewSnapshotDelayMS = 900
const transformControlSize = 0.58
const modelPreviewResizeCompleteEventName = 'litecad:model-preview-resize-complete'
const zeroTranslation: CADTranslation = { x: 0, y: 0, z: 0 }

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

const createWorldAxis = (
  name: string,
  direction: THREE.Vector3,
  length: number,
  radius: number,
  color: number,
  centerOffset = 0,
) => {
  const normalizedDirection = direction.clone().normalize()
  const axis = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 12),
    new THREE.MeshBasicMaterial({
      color,
      fog: true,
      opacity: 0.7,
      transparent: true,
      depthWrite: false,
    }),
  )

  axis.name = name
  axis.position.copy(normalizedDirection.clone().multiplyScalar(centerOffset))
  axis.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalizedDirection)
  axis.renderOrder = 1
  return axis
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
  const axisLength = axisSize * 2
  const axisRadius = Math.max(minorStep * 0.0025, gridSize * 0.000025)
  group.add(createWorldAxis('World X axis', new THREE.Vector3(1, 0, 0), axisLength, axisRadius, 0xe36b5d))
  group.add(createWorldAxis('World Y axis', new THREE.Vector3(0, 0, -1), axisLength, axisRadius, 0x55a968))
  group.add(createWorldAxis('World Z axis', new THREE.Vector3(0, 1, 0), axisSize, axisRadius, 0x5c86d6, axisSize / 2))

  return group
}

const previewMaterialColors = [0xb6c0b8, 0xc4b78a, 0x9fb6c8, 0xc7a0a0, 0xa8bea0]

const modelTranslationSignature = (translations: Record<string, CADTranslation> | undefined) =>
  Object.entries(translations ?? {})
    .sort(([leftID], [rightID]) => leftID.localeCompare(rightID))
    .map(([modelID, translation]) => `${modelID}:${translation.x},${translation.y},${translation.z}`)
    .join('|')

export function ModelPreview({
  deferResize = false,
  draftModelTranslations,
  modelTranslations,
  onClearSelection,
  onModelTranslationChange,
  onSnapshotCapture,
  onSelectModel,
  previewAssets = [],
  selectedModelId,
  variant = 'workspace',
  visibleModelIds,
}: ModelPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const deferResizeRef = useRef(deferResize)
  const draftModelTranslationsRef = useRef<Record<string, CADTranslation> | undefined>(draftModelTranslations)
  const modelTranslationsRef = useRef<Record<string, CADTranslation> | undefined>(modelTranslations)
  const onClearSelectionRef = useRef<ModelPreviewProps['onClearSelection']>(onClearSelection)
  const onModelTranslationChangeRef = useRef<ModelPreviewProps['onModelTranslationChange']>(onModelTranslationChange)
  const onSnapshotCaptureRef = useRef<ModelPreviewProps['onSnapshotCapture']>(onSnapshotCapture)
  const onSelectModelRef = useRef<ModelPreviewProps['onSelectModel']>(onSelectModel)
  const selectedModelIdRef = useRef<string | undefined>(selectedModelId)
  const visibleModelIdsRef = useRef<readonly string[]>(visibleModelIds)
  const previewObjectBasePositionsByModelIDRef = useRef(new Map<string, THREE.Vector3>())
  const previewObjectBaseUsesCADOrientationByModelIDRef = useRef(new Map<string, boolean>())
  const previewObjectBaseTranslationsByModelIDRef = useRef(new Map<string, CADTranslation>())
  const previewObjectsByModelIDRef = useRef(new Map<string, THREE.Object3D>())
  const syncSelectedPreviewObjectRef = useRef<() => void>(() => undefined)
  const syncPreviewObjectTransformsRef = useRef<() => void>(() => undefined)
  const syncPreviewObjectVisibilityRef = useRef<() => void>(() => undefined)
  const zoomHUDHideTimeoutRef = useRef<number | undefined>(undefined)
  const [zoomHUD, setZoomHUD] = useState<ZoomHUDState>({ percent: 100, visible: false })
  const previewAssetSignature = useMemo(() => projectPreviewAssetSignature(previewAssets), [previewAssets])
  const draftModelTranslationSignature = modelTranslationSignature(draftModelTranslations)
  const modelTranslationValueSignature = modelTranslationSignature(modelTranslations)
  const visibleModelIdSignature = visibleModelIds?.join('|') ?? '*'
  const isPreviewObjectVisible = (modelId: string) => !visibleModelIdsRef.current || visibleModelIdsRef.current.includes(modelId)
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
    onClearSelectionRef.current = onClearSelection
    onModelTranslationChangeRef.current = onModelTranslationChange
    onSnapshotCaptureRef.current = onSnapshotCapture
    onSelectModelRef.current = onSelectModel
    selectedModelIdRef.current = selectedModelId
    syncSelectedPreviewObjectRef.current()
  }, [onClearSelection, onModelTranslationChange, onSnapshotCapture, onSelectModel, selectedModelId])

  useEffect(() => {
    visibleModelIdsRef.current = visibleModelIds
    syncPreviewObjectVisibilityRef.current()
    // The signature keeps this effect primitive-stable while allowing callers to pass fresh arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleModelIdSignature])

  useEffect(() => {
    draftModelTranslationsRef.current = draftModelTranslations
    modelTranslationsRef.current = modelTranslations
    syncPreviewObjectTransformsRef.current()
    // The signatures keep this effect primitive-stable while allowing callers to pass fresh objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftModelTranslationSignature, modelTranslationValueSignature])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return undefined
    }
    hideZoomHUD()
    previewObjectsByModelIDRef.current = new Map()
    previewObjectBasePositionsByModelIDRef.current = new Map()
    previewObjectBaseUsesCADOrientationByModelIDRef.current = new Map()
    previewObjectBaseTranslationsByModelIDRef.current = new Map()
    syncSelectedPreviewObjectRef.current = () => undefined

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
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
    const transformControls = new TransformControls(camera, renderer.domElement)
    transformControls.setMode('translate')
    transformControls.setSize(transformControlSize)
    transformControls.showX = true
    transformControls.showY = true
    transformControls.showZ = true
    const transformControlsHelper = transformControls.getHelper()
    transformControlsHelper.traverse((child) => {
      if (child instanceof THREE.Line) {
        child.material.transparent = true
        child.material.opacity = 0.7
      } else if (child instanceof THREE.Mesh) {
        child.material.transparent = true
        child.material.opacity = 0.76
      }
    })
    scene.add(transformControlsHelper)
    const visibleTransformControlObjects = () => {
      const gizmo = (transformControls as unknown as { _gizmo?: { gizmo?: Record<string, THREE.Object3D> } })._gizmo?.gizmo
      return gizmo?.translate?.children.filter((child) => child.visible) ?? []
    }
    let activeOrientation = initialViewOrientation
    let lastEmittedOrientation = initialViewOrientation
    let viewAnimationFrameID: number | null = null
    let controlsFrameID: number | null = null
    let snapshotTimeoutID: number | undefined
    let isControlsInteracting = false
    let isTransformDragging = false
    let isProgrammaticCameraUpdate = false
    const idleCursor = variant === 'thumbnail' ? 'default' : 'grab'
    const previewCenter = new THREE.Vector3(0, 0, 0)
    let previewRadius = 4
    let fitViewDistance = camera.position.distanceTo(controls.target)
    let lastZoomDistance = fitViewDistance
    const previewGroup = new THREE.Group()
    previewGroup.name = 'Project preview models'
    let isDisposed = false
    let worldGrid = createWorldGrid(previewRadius)
    const selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0x2563eb)
    selectionBox.visible = false
    selectionBox.renderOrder = 30
    selectionBox.material.depthTest = false
    selectionBox.material.transparent = true
    selectionBox.material.opacity = 0.85
    scene.add(worldGrid)
    scene.add(previewGroup)
    scene.add(selectionBox)
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

    const captureSnapshot = () => {
      if (isDisposed || variant !== 'workspace' || previewObjectsByModelIDRef.current.size === 0 || !onSnapshotCaptureRef.current) {
        return
      }
      const sourceCanvas = renderer.domElement
      if (sourceCanvas.width === 0 || sourceCanvas.height === 0) {
        return
      }

      const wasSelectionBoxVisible = selectionBox.visible
      const wasTransformControlsVisible = transformControlsHelper.visible
      selectionBox.visible = false
      transformControlsHelper.visible = false
      renderer.render(scene, camera)

      const width = Math.min(modelPreviewSnapshotWidth, sourceCanvas.width)
      const height = Math.max(1, Math.round(width * (sourceCanvas.height / sourceCanvas.width)))
      const snapshotCanvas = document.createElement('canvas')
      snapshotCanvas.width = width
      snapshotCanvas.height = height
      const context = snapshotCanvas.getContext('2d')
      if (!context) {
        selectionBox.visible = wasSelectionBoxVisible
        transformControlsHelper.visible = wasTransformControlsVisible
        renderer.render(scene, camera)
        return
      }
      context.drawImage(sourceCanvas, 0, 0, width, height)

      selectionBox.visible = wasSelectionBoxVisible
      transformControlsHelper.visible = wasTransformControlsVisible
      renderer.render(scene, camera)

      const publishBlob = (blob: Blob | null) => {
        if (!blob || isDisposed) {
          return
        }
        onSnapshotCaptureRef.current?.({ blob, width, height })
      }
      snapshotCanvas.toBlob((blob) => {
        if (blob) {
          publishBlob(blob)
          return
        }
        snapshotCanvas.toBlob((fallbackBlob) => {
          publishBlob(fallbackBlob)
        }, 'image/png')
      }, 'image/webp', 0.76)
    }
    const scheduleSnapshotCapture = () => {
      if (variant !== 'workspace' || !onSnapshotCaptureRef.current) {
        return
      }
      if (snapshotTimeoutID !== undefined) {
        window.clearTimeout(snapshotTimeoutID)
      }
      snapshotTimeoutID = window.setTimeout(() => {
        snapshotTimeoutID = undefined
        captureSnapshot()
      }, modelPreviewSnapshotDelayMS)
    }
    const renderScene = () => {
      updateSceneFog(camera.position.distanceTo(controls.target))
      renderer.render(scene, camera)
    }
    syncPreviewObjectVisibilityRef.current = () => {
      const visibleModelIDs = visibleModelIdsRef.current ? new Set(visibleModelIdsRef.current) : undefined
      previewObjectsByModelIDRef.current.forEach((object, modelID) => {
        object.visible = !visibleModelIDs || visibleModelIDs.has(modelID)
      })
      syncSelectedPreviewObjectRef.current()
      renderScene()
      scheduleSnapshotCapture()
    }
    syncPreviewObjectTransformsRef.current = () => {
      previewObjectsByModelIDRef.current.forEach((object, modelID) => {
        const basePosition = previewObjectBasePositionsByModelIDRef.current.get(modelID)
        if (!basePosition) {
          return
        }
        const baseTranslation = previewObjectBaseTranslationsByModelIDRef.current.get(modelID) ?? zeroTranslation
        const activeTranslation = draftModelTranslationsRef.current?.[modelID] ?? modelTranslationsRef.current?.[modelID]
        if (!activeTranslation) {
          object.position.copy(basePosition)
          return
        }
        const previewTranslation = cadTranslationDeltaToPreviewTranslation(
          {
            x: activeTranslation.x - baseTranslation.x,
            y: activeTranslation.y - baseTranslation.y,
            z: activeTranslation.z - baseTranslation.z,
          },
          previewObjectBaseUsesCADOrientationByModelIDRef.current.get(modelID) ?? false,
        )
        object.position.copy(basePosition).add(new THREE.Vector3(previewTranslation.x, previewTranslation.y, previewTranslation.z))
      })
      syncSelectedPreviewObjectRef.current()
      renderScene()
      scheduleSnapshotCapture()
    }
    const updateSelectionBox = (object?: THREE.Object3D) => {
      if (!object || !object.visible) {
        selectionBox.visible = false
        return
      }
      selectionBox.setFromObject(object)
      selectionBox.visible = true
    }
    const selectedPreviewObjectTranslation = (modelID: string, object: THREE.Object3D) => {
      const basePosition = previewObjectBasePositionsByModelIDRef.current.get(modelID)
      if (!basePosition) {
        return undefined
      }
      const baseTranslation = previewObjectBaseTranslationsByModelIDRef.current.get(modelID) ?? zeroTranslation
      const previewTranslation = object.position.clone().sub(basePosition)
      return previewTranslationDeltaToCADTranslation(
        { x: previewTranslation.x, y: previewTranslation.y, z: previewTranslation.z },
        baseTranslation,
        previewObjectBaseUsesCADOrientationByModelIDRef.current.get(modelID) ?? false,
      )
    }
    syncSelectedPreviewObjectRef.current = () => {
      const selectedModelID = selectedModelIdRef.current
      const selectedObject = selectedModelID ? previewObjectsByModelIDRef.current.get(selectedModelID) : undefined
      if (!selectedObject || !selectedObject.visible) {
        transformControls.detach()
        updateSelectionBox()
        renderer.domElement.style.cursor = idleCursor
        renderScene()
        return
      }
      transformControls.attach(selectedObject)
      updateSelectionBox(selectedObject)
      renderer.domElement.style.cursor = isTransformDragging ? 'grabbing' : 'pointer'
      renderScene()
    }
    const handleTransformDraggingChanged = (event: { value?: unknown }) => {
      isTransformDragging = Boolean(event.value)
      controls.enabled = !isTransformDragging
      renderer.domElement.style.cursor = isTransformDragging ? 'grabbing' : selectedModelIdRef.current ? 'pointer' : idleCursor
      if (isTransformDragging) {
        cancelViewAnimation()
      }
      renderScene()
    }
    const handleTransformObjectChange = () => {
      const selectedModelID = selectedModelIdRef.current
      const selectedObject = selectedModelID ? previewObjectsByModelIDRef.current.get(selectedModelID) : undefined
      if (!selectedModelID || !selectedObject) {
        return
      }
      updateSelectionBox(selectedObject)
      const translation = selectedPreviewObjectTranslation(selectedModelID, selectedObject)
      if (translation) {
        onModelTranslationChangeRef.current?.(selectedModelID, translation)
      }
      renderScene()
    }
    transformControls.addEventListener('dragging-changed', handleTransformDraggingChanged)
    transformControls.addEventListener('objectChange', handleTransformObjectChange)
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
      object.userData.litecadModelId = asset.modelId
      if (asset.transform?.matrix.length === 16) {
        const matrix = new THREE.Matrix4()
        matrix.set(
          asset.transform.matrix[0] ?? 1,
          asset.transform.matrix[1] ?? 0,
          asset.transform.matrix[2] ?? 0,
          asset.transform.matrix[3] ?? 0,
          asset.transform.matrix[4] ?? 0,
          asset.transform.matrix[5] ?? 1,
          asset.transform.matrix[6] ?? 0,
          asset.transform.matrix[7] ?? 0,
          asset.transform.matrix[8] ?? 0,
          asset.transform.matrix[9] ?? 0,
          asset.transform.matrix[10] ?? 1,
          asset.transform.matrix[11] ?? 0,
          asset.transform.matrix[12] ?? 0,
          asset.transform.matrix[13] ?? 0,
          asset.transform.matrix[14] ?? 0,
          asset.transform.matrix[15] ?? 1,
        )
        object.applyMatrix4(matrix)
      }
      if (asset.previewFormat === 'obj' || asset.previewFormat === 'kernel-mesh') {
        orientCADPreviewObject(object)
      }
      previewObjectBasePositionsByModelIDRef.current.set(asset.modelId, object.position.clone())
      previewObjectBaseUsesCADOrientationByModelIDRef.current.set(
        asset.modelId,
        asset.previewFormat === 'obj' || asset.previewFormat === 'kernel-mesh',
      )
      previewObjectBaseTranslationsByModelIDRef.current.set(
        asset.modelId,
        asset.transform ? translationFromCADTransform(asset.transform) : zeroTranslation,
      )
      syncPreviewObjectTransformsRef.current()
      object.visible = isPreviewObjectVisible(asset.modelId)
      object.traverse((child) => {
        child.userData.litecadModelId = asset.modelId
        if (child instanceof THREE.Mesh) {
          const objectName = `${child.name} ${child.parent?.name ?? ''}`
          if (asset.previewFormat === 'obj' || asset.previewFormat === 'kernel-mesh') {
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
      previewObjectsByModelIDRef.current.set(asset.modelId, object)
      previewGroup.add(object)
      syncPreviewObjectTransformsRef.current()
      syncSelectedPreviewObjectRef.current()
      updatePreviewBounds()
      scheduleSnapshotCapture()
    }

    renderer.domElement.style.cursor = idleCursor

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let pointerDown: { x: number; y: number; pointerID: number } | undefined
    const findModelIDFromObject = (object: THREE.Object3D) => {
      let currentObject: THREE.Object3D | null = object
      while (currentObject) {
        if (typeof currentObject.userData.litecadModelId === 'string') {
          return currentObject.userData.litecadModelId as string
        }
        currentObject = currentObject.parent
      }
      return undefined
    }
    const modelIDFromPointerEvent = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        return undefined
      }
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      raycaster.setFromCamera(pointer, camera)
      const visibleObjects = [...previewObjectsByModelIDRef.current.values()].filter((object) => object.visible)
      const intersection = raycaster.intersectObjects(visibleObjects, true)[0]
      return intersection ? findModelIDFromObject(intersection.object) : undefined
    }
    const isTransformControlPointerEvent = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      if (!selectedModelIdRef.current || rect.width === 0 || rect.height === 0) {
        return false
      }
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      raycaster.setFromCamera(pointer, camera)
      return raycaster.intersectObjects(visibleTransformControlObjects(), true).length > 0
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return
      }
      const modelID = modelIDFromPointerEvent(event)
      const isTransformControlPointer = isTransformControlPointerEvent(event)
      pointerDown = { x: event.clientX, y: event.clientY, pointerID: event.pointerId }
      if (!modelID && !isTransformControlPointer) {
        onClearSelectionRef.current?.()
      }
    }
    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerDown || pointerDown.pointerID !== event.pointerId) {
        pointerDown = undefined
        return
      }
      const deltaX = event.clientX - pointerDown.x
      const deltaY = event.clientY - pointerDown.y
      pointerDown = undefined
      if (isTransformDragging || Math.hypot(deltaX, deltaY) > 5) {
        return
      }
      const modelID = modelIDFromPointerEvent(event)
      if (modelID) {
        onSelectModelRef.current?.(modelID)
        return
      }
      if (isTransformControlPointerEvent(event)) {
        return
      }
      onClearSelectionRef.current?.()
    }
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)

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
      const frameSize = previewRadius * (variant === 'thumbnail' ? 2.15 : width < 640 ? 3.9 : 3.35)
      const distance = Math.max(
        frameSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)),
        previewRadius * (variant === 'thumbnail' ? 3.15 : 4.5),
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

    previewAssets.forEach((asset, assetIndex) => {
      if (asset.previewFormat === 'obj') {
        new OBJLoader().load(asset.previewUrl, (object) => addPreviewObject(asset, assetIndex, object))
      } else if (asset.previewFormat === 'kernel-mesh') {
        addPreviewObject(asset, assetIndex, createKernelMeshPreviewObject(asset.mesh))
      } else if (asset.previewFormat === 'glb' || asset.previewFormat === 'gltf') {
        new GLTFLoader().load(asset.previewUrl, (gltf) => addPreviewObject(asset, assetIndex, gltf.scene))
      }
    })

    return () => {
	      cancelViewAnimation()
	      cancelControlsUpdate()
	      window.cancelAnimationFrame(resetFrameID)
	      window.clearTimeout(resetTimeoutID)
	      if (snapshotTimeoutID !== undefined) {
	        window.clearTimeout(snapshotTimeoutID)
	      }
      clearZoomHUDHideTimeout()
      resizeObserver.disconnect()
      container.removeEventListener(resetViewEventName, handleResetView)
      container.removeEventListener(modelPreviewResizeCompleteEventName, handleDeferredResizeComplete)
      container.removeEventListener(setViewEventName, handleSetView)
      window.removeEventListener('pageshow', handlePageShow)
      controls.removeEventListener('start', startControlsInteraction)
      controls.removeEventListener('end', stopControlsInteraction)
      controls.removeEventListener('change', handleControlsChange)
      transformControls.removeEventListener('dragging-changed', handleTransformDraggingChanged)
      transformControls.removeEventListener('objectChange', handleTransformObjectChange)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      controls.dispose()
      transformControls.detach()
      transformControls.dispose()
      isDisposed = true
      syncPreviewObjectVisibilityRef.current = () => undefined
      syncPreviewObjectTransformsRef.current = () => undefined
      syncSelectedPreviewObjectRef.current = () => undefined
      previewObjectsByModelIDRef.current = new Map()
      previewObjectBasePositionsByModelIDRef.current = new Map()
      previewObjectBaseUsesCADOrientationByModelIDRef.current = new Map()
      previewObjectBaseTranslationsByModelIDRef.current = new Map()
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
      {variant === 'workspace' && (
        <div
          aria-hidden={!zoomHUD.visible}
          className={`pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-md border border-[#d6dbe3] bg-white/92 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase text-[#475569] shadow-[0_10px_28px_rgba(15,23,42,0.08)] backdrop-blur transition duration-300 motion-reduce:transition-none ${
            zoomHUD.visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
          }`}
        >
          View {zoomHUD.percent}%
        </div>
      )}
    </div>
  )
}
