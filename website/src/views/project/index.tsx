import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import * as THREE from 'three'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'
import {
  ArrowLeft,
  Box,
  Boxes,
  CheckCircle2,
  Circle,
  Cuboid,
  FileText,
  Layers3,
  MousePointer2,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PenTool,
  Ruler,
  Share2,
  SlidersHorizontal,
  SquareDashedMousePointer,
  Triangle,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { fetchProject } from 'src/api/projects'
import { viewAxisDefinitions } from './view-axis'
import { ViewController } from './view-controller'
import {
  cameraToOrientation,
  createOrientation,
  easeOutCubic,
  initialViewOrientation,
  interpolateOrientation,
  isViewOrientation,
  orientationDistance,
  orientationToViewDirection,
  rotateOrientation,
  viewOrientationAnimationDuration,
  type ViewOrientation,
  type ViewRotationStep,
} from './view-orientation'

const canvasTools = [
  { label: 'Select', icon: MousePointer2, active: true },
  { label: 'Sketch', icon: PenTool },
  { label: 'Extrude', icon: Cuboid },
  { label: 'Measure', icon: Ruler },
  { label: 'Region select', icon: SquareDashedMousePointer },
  { label: 'Solid', icon: Box },
  { label: 'Triangle', icon: Triangle },
  { label: 'Circle', icon: Circle },
  { label: 'Adjust', icon: SlidersHorizontal },
]

const primaryTools = canvasTools.slice(0, 4)
const geometryTools = canvasTools.slice(4)

const modelTree = [
  {
    label: 'Bodies',
    items: [
      { label: 'Base plate', state: 'ready', icon: Boxes },
      { label: 'Mounting rib', state: 'draft', icon: Box },
    ],
  },
  {
    label: 'Construction',
    items: [{ label: 'Reference plane', state: 'locked', icon: Layers3 }],
  },
]

function ModelPreview() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return undefined
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.position = 'absolute'
    renderer.domElement.style.inset = '0'
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x1b1d19, 18, 56)

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    camera.position.set(8, 6.5, 10)

    const controls = new TrackballControls(camera, renderer.domElement)
    controls.staticMoving = true
    controls.noPan = false
    controls.noZoom = false
    controls.rotateSpeed = 1.2
    controls.panSpeed = 0.35
    controls.zoomSpeed = 1.15
    controls.minZoom = 0.55
    controls.maxZoom = 4
    controls.target.set(0, 0.15, 0)
    let activeOrientation = initialViewOrientation
    let lastEmittedOrientation = initialViewOrientation
    let viewAnimationFrameID: number | null = null
    let controlsFrameID: number | null = null
    let isControlsInteracting = false
    let isProgrammaticCameraUpdate = false
    const renderScene = () => renderer.render(scene, camera)
    const emitOrientationChange = (orientation: ViewOrientation) => {
      if (orientationDistance(lastEmittedOrientation, orientation) < 0.2) {
        return
      }
      lastEmittedOrientation = orientation
      window.dispatchEvent(new CustomEvent('litecad:view-orientation-change', { detail: { orientation } }))
    }
    const handleControlsChange = () => {
      if (isProgrammaticCameraUpdate) {
        return
      }
      activeOrientation = cameraToOrientation(camera, controls.target)
      emitOrientationChange(activeOrientation)
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

    const ambient = new THREE.HemisphereLight(0xf4ecd7, 0x293125, 1.5)
    scene.add(ambient)

    const keyLight = new THREE.DirectionalLight(0xf3ead2, 3.1)
    keyLight.position.set(5, 7, 4)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0x9fb08f, 1.3)
    fillLight.position.set(-4, 3, -5)
    scene.add(fillLight)

    const grid = new THREE.GridHelper(40, 160, 0x58604f, 0x31362f)
    grid.position.y = -0.52
    scene.add(grid)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.53
    ground.receiveShadow = true
    scene.add(ground)

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
        context.strokeStyle = '#111310'
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

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xaab69a,
      metalness: 0.12,
      roughness: 0.64,
    })
    const ribMaterial = new THREE.MeshStandardMaterial({
      color: 0x879875,
      metalness: 0.08,
      roughness: 0.58,
    })
    const holeMaterial = new THREE.MeshStandardMaterial({
      color: 0x111310,
      metalness: 0.2,
      roughness: 0.5,
    })
    const constructionMaterial = new THREE.MeshStandardMaterial({
      color: 0xb7c3a8,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      roughness: 0.75,
    })

    const assembly = new THREE.Group()
    assembly.rotation.y = -0.55
    assembly.rotation.x = 0.08
    scene.add(assembly)
    const draggableMeshes: THREE.Object3D[] = []

    const base = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.34, 1.35), bodyMaterial)
    base.castShadow = true
    base.receiveShadow = true
    assembly.add(base)
    draggableMeshes.push(base)

    const leftRib = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.55, 1.25), ribMaterial)
    leftRib.position.set(-0.95, 0.6, 0)
    leftRib.castShadow = true
    leftRib.receiveShadow = true
    assembly.add(leftRib)
    draggableMeshes.push(leftRib)

    const rightRib = leftRib.clone()
    rightRib.position.x = 0.95
    assembly.add(rightRib)
    draggableMeshes.push(rightRib)

    const holeGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.42, 48)
    holeGeometry.rotateX(Math.PI / 2)
    const leftHole = new THREE.Mesh(holeGeometry, holeMaterial)
    leftHole.position.set(-1.35, 0.02, 0.69)
    assembly.add(leftHole)
    draggableMeshes.push(leftHole)
    const rightHole = leftHole.clone()
    rightHole.position.x = 1.35
    assembly.add(rightHole)
    draggableMeshes.push(rightHole)

    const referencePlane = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 2.25), constructionMaterial)
    referencePlane.position.set(0, 0.52, 0)
    referencePlane.rotation.y = Math.PI / 2
    assembly.add(referencePlane)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const dragStart = new THREE.Vector3()
    const assemblyStart = new THREE.Vector3()
    const planeHit = new THREE.Vector3()
    const dragDelta = new THREE.Vector3()
    let activePointerID: number | null = null
    let isDraggingAssembly = false

    const updatePointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return
      }
      cancelViewAnimation()
      updatePointer(event)
      const hits = raycaster.intersectObjects(draggableMeshes, false)
      if (hits.length === 0) {
        return
      }

      const hitPoint = hits[0].point
      dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), hitPoint)
      if (!raycaster.ray.intersectPlane(dragPlane, dragStart)) {
        return
      }

      activePointerID = event.pointerId
      isDraggingAssembly = true
      assemblyStart.copy(assembly.position)
      cancelControlsUpdate()
      controls.enabled = false
      renderer.domElement.setPointerCapture(event.pointerId)
      renderer.domElement.style.cursor = 'grabbing'
      event.preventDefault()
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerID !== event.pointerId || !isDraggingAssembly) {
        return
      }
      updatePointer(event)
      if (raycaster.ray.intersectPlane(dragPlane, planeHit)) {
        dragDelta.copy(planeHit).sub(dragStart)
        assembly.position.copy(assemblyStart).add(dragDelta)
        renderScene()
      }
      event.preventDefault()
    }

    const stopDragging = (event: PointerEvent) => {
      if (activePointerID !== event.pointerId) {
        return
      }
      activePointerID = null
      isDraggingAssembly = false
      controls.enabled = true
      renderer.domElement.style.cursor = 'grab'
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId)
      }
    }

    renderer.domElement.style.cursor = 'grab'
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerup', stopDragging)
    renderer.domElement.addEventListener('pointercancel', stopDragging)

    const edges = new THREE.Group()
    for (const mesh of [base, leftRib, rightRib]) {
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: 0xd8d1bf, transparent: true, opacity: 0.32 }),
      )
      edge.position.copy(mesh.position)
      edges.add(edge)
    }
    assembly.add(edges)

    const updateCameraForOrientation = (width: number, height: number, orientation: ViewOrientation) => {
      const bounds = new THREE.Box3().setFromObject(assembly)
      const sphere = new THREE.Sphere()
      bounds.getBoundingSphere(sphere)
      const direction = orientationToViewDirection(orientation)
      const up = orientation.up
        ? new THREE.Vector3(...orientation.up).normalize()
        : new THREE.Vector3(
            ...(Math.abs(direction.y) > 0.98
              ? ([0, 0, direction.y > 0 ? -1 : 1] as [number, number, number])
              : ([0, 1, 0] as [number, number, number])),
          )
      const aspect = width / Math.max(height, 1)
      const viewSize = sphere.radius * (width < 640 ? 2.65 : 2.45)

      isProgrammaticCameraUpdate = true
      controls.target.copy(sphere.center)
      camera.up.copy(up)
      camera.position.copy(sphere.center).add(direction.multiplyScalar(28))
      camera.left = (-viewSize * aspect) / 2
      camera.right = (viewSize * aspect) / 2
      camera.top = viewSize / 2
      camera.bottom = -viewSize / 2
      camera.near = 0.1
      camera.far = 100
      camera.zoom = 1
      camera.lookAt(sphere.center)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      controls.update()
      isProgrammaticCameraUpdate = false
    }

    const cancelViewAnimation = () => {
      if (viewAnimationFrameID === null) {
        return
      }
      window.cancelAnimationFrame(viewAnimationFrameID)
      viewAnimationFrameID = null
      activeOrientation = cameraToOrientation(camera, controls.target)
      lastEmittedOrientation = activeOrientation
      window.dispatchEvent(new CustomEvent('litecad:view-orientation-change', { detail: { orientation: activeOrientation } }))
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

    const resize = () => {
      resetView()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resetView()
    const resetFrameID = window.requestAnimationFrame(resetView)
    const resetTimeoutID = window.setTimeout(resetView, 250)

    const handleResetView = () => resetView()
    const handlePageShow = () => resetView()
    const handleSetView = (event: Event) => {
      const orientation = (event as CustomEvent<{ orientation?: unknown }>).detail?.orientation
      if (!isViewOrientation(orientation)) {
        return
      }
      animateViewOrientation({
        ...createOrientation(orientation.yaw, orientation.pitch),
        ...(orientation.direction ? { direction: orientation.direction } : {}),
        ...(orientation.rotationStep ? { rotationStep: orientation.rotationStep } : {}),
        ...(orientation.up ? { up: orientation.up } : {}),
      })
    }
    container.addEventListener('litecad:reset-view', handleResetView)
    container.addEventListener('litecad:set-view', handleSetView)
    window.addEventListener('pageshow', handlePageShow)
    controls.addEventListener('start', startControlsInteraction)
    controls.addEventListener('end', stopControlsInteraction)

    return () => {
      cancelViewAnimation()
      cancelControlsUpdate()
      window.cancelAnimationFrame(resetFrameID)
      window.clearTimeout(resetTimeoutID)
      resizeObserver.disconnect()
      container.removeEventListener('litecad:reset-view', handleResetView)
      container.removeEventListener('litecad:set-view', handleSetView)
      window.removeEventListener('pageshow', handlePageShow)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerup', stopDragging)
      renderer.domElement.removeEventListener('pointercancel', stopDragging)
      controls.removeEventListener('start', startControlsInteraction)
      controls.removeEventListener('end', stopControlsInteraction)
      controls.removeEventListener('change', handleControlsChange)
      controls.dispose()

      const disposedGeometries = new Set<THREE.BufferGeometry>()
      const disposedMaterials = new Set<THREE.Material>()
      const disposedTextures = new Set<THREE.Texture>()
      const disposeMaterial = (material: THREE.Material) => {
        if (disposedMaterials.has(material)) {
          return
        }
        const materialRecord = material as THREE.Material & Record<string, unknown>
        for (const value of Object.values(materialRecord)) {
          if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
            value.dispose()
            disposedTextures.add(value)
          }
        }
        material.dispose()
        disposedMaterials.add(material)
      }
      scene.traverse((object) => {
        const disposableObject = object as THREE.Object3D & {
          geometry?: THREE.BufferGeometry
          material?: THREE.Material | THREE.Material[]
        }
        if (disposableObject.geometry instanceof THREE.BufferGeometry && !disposedGeometries.has(disposableObject.geometry)) {
          disposableObject.geometry.dispose()
          disposedGeometries.add(disposableObject.geometry)
        }
        const { material } = disposableObject
        if (Array.isArray(material)) {
          material.forEach(disposeMaterial)
        } else if (material instanceof THREE.Material) {
          disposeMaterial(material)
        }
      })
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return <div ref={containerRef} className="absolute inset-0" data-model-preview />
}

function ProjectView() {
  const { projectId = '' } = useParams()
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false)
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false)
  const [animateViewCubeOrientation, setAnimateViewCubeOrientation] = useState(false)
  const [viewOrientation, setViewOrientation] = useState<ViewOrientation>(initialViewOrientation)
  const projectQuery = useQuery({
    queryKey: ['projects', projectId],
    queryFn: async () => (await fetchProject(projectId)).data.project,
    enabled: projectId !== '',
  })
  const project = projectQuery.data

  useEffect(() => {
    const handleViewOrientationChange = (event: Event) => {
      const orientation = (event as CustomEvent<{ orientation?: unknown }>).detail?.orientation
      if (!isViewOrientation(orientation)) {
        return
      }
      const nextOrientation = {
        ...createOrientation(orientation.yaw, orientation.pitch),
        ...(orientation.direction ? { direction: orientation.direction } : {}),
        ...(orientation.rotationStep ? { rotationStep: orientation.rotationStep } : {}),
        ...(orientation.up ? { up: orientation.up } : {}),
      }
      setAnimateViewCubeOrientation(false)
      setViewOrientation((currentOrientation) =>
        orientationDistance(currentOrientation, nextOrientation) < 0.2 ? currentOrientation : nextOrientation,
      )
    }

    window.addEventListener('litecad:view-orientation-change', handleViewOrientationChange)
    return () => window.removeEventListener('litecad:view-orientation-change', handleViewOrientationChange)
  }, [])

  if (projectQuery.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#101210] text-[#e9e2d0]">
        <div className="font-mono text-xs uppercase tracking-wide text-[#9d988a]">Opening project</div>
      </div>
    )
  }

  if (projectQuery.isError || !project) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#101210] px-5 text-center text-[#e9e2d0]">
        <div>
          <FileText className="mx-auto size-8 text-[#cfc6b2]" />
          <h1 className="mt-4 text-2xl font-semibold">Project unavailable</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#9d988a]">
            This project could not be loaded. It may have been removed or belongs to another account.
          </p>
          <Link
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#e9e2d0] px-4 text-sm font-semibold text-[#111310] no-underline"
            to="/projects"
          >
            <ArrowLeft className="size-4" />
            All projects
          </Link>
        </div>
      </div>
    )
  }

  const updatedAt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(project.updated_at))
  const projectColumns = `${isLeftPanelCollapsed ? '56px' : '270px'} minmax(0,1fr) ${isRightPanelCollapsed ? '56px' : '304px'}`
  const shellStyle = { '--project-columns': projectColumns } as CSSProperties
  const LeftPanelIcon = isLeftPanelCollapsed ? PanelLeftOpen : PanelLeftClose
  const RightPanelIcon = isRightPanelCollapsed ? PanelRightOpen : PanelRightClose
  const applyCanvasOrientation = (orientation: ViewOrientation) => {
    const nextOrientation = {
      ...createOrientation(orientation.yaw, orientation.pitch),
      ...(orientation.direction ? { direction: orientation.direction } : {}),
      ...(orientation.rotationStep ? { rotationStep: orientation.rotationStep } : {}),
      ...(orientation.up ? { up: orientation.up } : {}),
    }
    setAnimateViewCubeOrientation(true)
    setViewOrientation(nextOrientation)
    document
      .querySelector('[data-model-preview]')
      ?.dispatchEvent(new CustomEvent('litecad:set-view', { detail: { orientation: nextOrientation } }))
  }
  const stepCanvasOrientation = (step: ViewRotationStep) => {
    applyCanvasOrientation({ ...rotateOrientation(viewOrientation, step), rotationStep: step })
  }
  const flipCanvasOrientation = () => {
    applyCanvasOrientation({ ...rotateOrientation(viewOrientation, { horizontal: 180 }), rotationStep: { horizontal: 180 } })
  }

  return (
    <div className="grid min-h-screen grid-rows-[56px_minmax(0,1fr)] bg-[#111310] text-[#e9e2d0]">
      <header className="grid border-b border-[#2d302b] bg-[#151814] px-3 lg:grid-cols-[270px_minmax(0,1fr)_304px]">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            className="grid size-9 shrink-0 place-items-center rounded-md text-[#a8a293] no-underline transition hover:bg-[#242820] hover:text-[#f7f1e4]"
            title="All projects"
            to="/projects"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight text-[#f7f1e4]">{project.name}</h1>
          </div>
        </div>

        <div className="hidden items-center justify-center gap-1 lg:flex">
          {primaryTools.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={`grid size-9 place-items-center rounded-md transition ${
                  item.active ? 'bg-[#e9e2d0] text-[#111310]' : 'text-[#a8a293] hover:bg-[#242820] hover:text-[#f7f1e4]'
                }`}
                key={item.label}
                title={item.label}
                type="button"
              >
                <Icon className="size-4" />
              </button>
            )
          })}
        </div>

        <div className="hidden items-center justify-end gap-3 lg:flex">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase text-[#8c887c]">
            <CheckCircle2 className="size-4 text-[#b7c3a8]" />
            Autosaved
          </div>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-[#a8a293] transition hover:bg-[#242820] hover:text-[#f7f1e4]"
            type="button"
          >
            <Share2 className="size-4" />
            Share
          </button>
        </div>
      </header>

      <div className="grid min-h-0 lg:grid-cols-[var(--project-columns)]" style={shellStyle}>
        <aside
          className={`hidden min-h-0 border-r border-[#2d302b] bg-[#171a16] lg:block ${
            isLeftPanelCollapsed ? 'p-2' : 'p-4'
          }`}
        >
          <div className="flex items-center justify-between">
            {!isLeftPanelCollapsed && <p className="font-mono text-[11px] uppercase text-[#8c887c]">Project</p>}
            <button
              aria-label={isLeftPanelCollapsed ? 'Expand left panel' : 'Collapse left panel'}
              className="grid size-8 place-items-center rounded-md text-[#8c887c] transition hover:bg-[#242820] hover:text-[#f7f1e4]"
              onClick={() => setIsLeftPanelCollapsed((collapsed) => !collapsed)}
              title={isLeftPanelCollapsed ? 'Expand left panel' : 'Collapse left panel'}
              type="button"
            >
              <LeftPanelIcon className="size-4" />
            </button>
          </div>

          {!isLeftPanelCollapsed && (
            <>
              <section className="mt-3">
                <p className="text-sm leading-6 text-[#aaa593]">
                  {project.description || 'No description yet. Start by sketching or importing a reference.'}
                </p>
              </section>

              <section className="mt-8">
                <p className="font-mono text-[11px] uppercase text-[#8c887c]">Model</p>
                <div className="mt-3 grid gap-5">
                  {modelTree.map((group) => (
                    <div key={group.label}>
                      <p className="mb-1 px-2 font-mono text-[10px] uppercase text-[#68655d]">{group.label}</p>
                      <div className="grid gap-1">
                        {group.items.map((item) => {
                          const Icon = item.icon
                          return (
                            <button
                              className="flex h-10 items-center justify-between rounded-md px-2 text-left text-sm text-[#d8d1bf] transition hover:bg-[#242820]"
                              key={item.label}
                              type="button"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <Icon className="size-4 text-[#b7c3a8]" />
                                <span className="truncate">{item.label}</span>
                              </span>
                              <span className="font-mono text-[10px] uppercase text-[#8c887c]">{item.state}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </aside>

        <section className="relative min-h-0 overflow-hidden bg-[#1b1d19]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(183,195,168,0.13),transparent_34%)]" />
          <ModelPreview key={project.id} />

          <button
            className="absolute left-4 top-4 flex items-center gap-2 rounded-md border border-[#34382f] bg-[#151814]/88 px-3 py-2 text-xs text-[#aaa593] backdrop-blur transition hover:bg-[#242820] hover:text-[#f7f1e4]"
            onClick={() => applyCanvasOrientation(initialViewOrientation)}
            title="Reset isometric view"
            type="button"
          >
            <Orbit className="size-4 text-[#b7c3a8]" />
            Isometric
          </button>

          <ViewController
            animateViewCubeOrientation={animateViewCubeOrientation}
            onFlip={flipCanvasOrientation}
            onSetOrientation={applyCanvasOrientation}
            onStep={stepCanvasOrientation}
            orientation={viewOrientation}
          />

          <div className="absolute right-4 top-[160px] hidden items-center gap-2 rounded-md border border-[#34382f] bg-[#151814]/88 px-3 py-2 font-mono text-[11px] uppercase text-[#8c887c] backdrop-blur sm:flex">
            Grid 10 mm
          </div>

          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md border border-[#34382f] bg-[#151814]/92 p-1 shadow-xl backdrop-blur">
            {geometryTools.map((item) => {
              const Icon = item.icon
              return (
                <button
                  className={`grid size-9 place-items-center rounded transition ${
                    item.active ? 'bg-[#e9e2d0] text-[#111310]' : 'text-[#a8a293] hover:bg-[#242820] hover:text-[#f7f1e4]'
                  }`}
                  key={item.label}
                  title={item.label}
                  type="button"
                >
                  <Icon className="size-4" />
                </button>
              )
            })}
          </div>
        </section>

        <aside
          className={`hidden min-h-0 border-l border-[#2d302b] bg-[#171a16] xl:block ${
            isRightPanelCollapsed ? 'p-2' : 'p-4'
          }`}
        >
          <div className="flex items-center justify-between">
            {!isRightPanelCollapsed && <p className="font-mono text-[11px] uppercase text-[#8c887c]">Inspector</p>}
            <button
              aria-label={isRightPanelCollapsed ? 'Expand right panel' : 'Collapse right panel'}
              className="grid size-8 place-items-center rounded-md text-[#8c887c] transition hover:bg-[#242820] hover:text-[#f7f1e4]"
              onClick={() => setIsRightPanelCollapsed((collapsed) => !collapsed)}
              title={isRightPanelCollapsed ? 'Expand right panel' : 'Collapse right panel'}
              type="button"
            >
              <RightPanelIcon className="size-4" />
            </button>
          </div>

          {!isRightPanelCollapsed && (
            <>
              <section className="mt-5 rounded-md border border-[#34382f] bg-[#111310] p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f7f1e4]">
                  <CheckCircle2 className="size-4 text-[#b7c3a8]" />
                  Ready for sketch
                </div>
                <p className="mt-2 text-sm leading-6 text-[#aaa593]">
                  Build the first solid from a prompt, a sketch, or an imported reference.
                </p>
              </section>

              <section className="mt-5">
                <p className="font-mono text-[11px] uppercase text-[#8c887c]">Document</p>
                <dl className="mt-3 grid gap-3 text-sm">
                  <div className="flex items-center justify-between border-b border-[#2d302b] pb-2">
                    <dt className="text-[#8c887c]">Updated</dt>
                    <dd className="text-[#d8d1bf]">{updatedAt}</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-[#2d302b] pb-2">
                    <dt className="text-[#8c887c]">Units</dt>
                    <dd className="text-[#d8d1bf]">Millimeters</dd>
                  </div>
                  <div className="flex items-center justify-between border-b border-[#2d302b] pb-2">
                    <dt className="text-[#8c887c]">Kernel</dt>
                    <dd className="text-[#d8d1bf]">Preview</dd>
                  </div>
                </dl>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

export default ProjectView
