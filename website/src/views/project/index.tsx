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

type ViewOrientation = {
  direction?: [number, number, number]
  pitch: number
  up?: [number, number, number]
  yaw: number
}
type ViewRotationStep = {
  horizontal?: number
  roll?: number
  vertical?: number
}

type HorizontalFace = 'front' | 'right' | 'back' | 'left'

const initialViewOrientation: ViewOrientation = { yaw: 38, pitch: 27 }

const clampPitch = (pitch: number) => Math.max(-89, Math.min(89, pitch))
const normalizeYaw = (yaw: number) => ((yaw % 360) + 360) % 360
const createOrientation = (yaw: number, pitch: number): ViewOrientation => ({
  yaw: normalizeYaw(yaw),
  pitch: clampPitch(pitch),
})
const isViewOrientation = (orientation: unknown): orientation is ViewOrientation => {
  if (!orientation || typeof orientation !== 'object') {
    return false
  }
  const candidate = orientation as Partial<ViewOrientation>
  const hasValidDirection =
    candidate.direction === undefined ||
    (Array.isArray(candidate.direction) &&
      candidate.direction.length === 3 &&
      candidate.direction.every((value) => Number.isFinite(value)))
  const hasValidUp =
    candidate.up === undefined ||
    (Array.isArray(candidate.up) && candidate.up.length === 3 && candidate.up.every((value) => Number.isFinite(value)))
  return Number.isFinite(candidate.yaw) && Number.isFinite(candidate.pitch) && hasValidDirection && hasValidUp
}
const orientationToDirection = ({ yaw, pitch }: ViewOrientation) => {
  const yawRadians = (normalizeYaw(yaw) * Math.PI) / 180
  const pitchRadians = (clampPitch(pitch) * Math.PI) / 180
  const levelRadius = Math.cos(pitchRadians)

  return new THREE.Vector3(
    Math.sin(yawRadians) * levelRadius,
    Math.sin(pitchRadians),
    Math.cos(yawRadians) * levelRadius,
  ).normalize()
}
const orientationToViewDirection = (orientation: ViewOrientation) =>
  orientation.direction ? new THREE.Vector3(...orientation.direction).normalize() : orientationToDirection(orientation)
const fallbackUpForDirection = (direction: THREE.Vector3) =>
  new THREE.Vector3(
    ...(Math.abs(direction.y) > 0.98
      ? ([0, 0, direction.y > 0 ? -1 : 1] as [number, number, number])
      : ([0, 1, 0] as [number, number, number])),
  )
const orientationToViewUp = (orientation: ViewOrientation) =>
  (orientation.up ? new THREE.Vector3(...orientation.up) : fallbackUpForDirection(orientationToViewDirection(orientation))).normalize()
const directionToOrientation = (direction: THREE.Vector3) => {
  const normalizedDirection = direction.clone().normalize()
  return createOrientation(
    (Math.atan2(normalizedDirection.x, normalizedDirection.z) * 180) / Math.PI,
    (Math.asin(THREE.MathUtils.clamp(normalizedDirection.y, -1, 1)) * 180) / Math.PI,
  )
}
const cameraToOrientation = (camera: THREE.Camera, target: THREE.Vector3): ViewOrientation => {
  const direction = camera.position.clone().sub(target).normalize()
  const orientation = directionToOrientation(direction)
  const up = camera.up.clone().normalize()
  return { ...orientation, direction: [direction.x, direction.y, direction.z], up: [up.x, up.y, up.z] }
}
const createFreeOrientation = (direction: THREE.Vector3, up: THREE.Vector3): ViewOrientation => {
  const normalizedDirection = direction.clone().normalize()
  const normalizedUp = up.clone().normalize()
  const orientation = directionToOrientation(normalizedDirection)
  return {
    ...orientation,
    direction: [normalizedDirection.x, normalizedDirection.y, normalizedDirection.z],
    up: [normalizedUp.x, normalizedUp.y, normalizedUp.z],
  }
}
const orientationToQuaternion = (orientation: ViewOrientation) =>
  new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(orientationToViewDirection(orientation), new THREE.Vector3(0, 0, 0), orientationToViewUp(orientation)),
  )
const orientationDistance = (first: ViewOrientation, second: ViewOrientation) => {
  const firstDirection = orientationToViewDirection(first)
  const secondDirection = orientationToViewDirection(second)
  const directionDistance = (firstDirection.angleTo(secondDirection) * 180) / Math.PI
  const firstUp = first.up ? new THREE.Vector3(...first.up).normalize() : null
  const secondUp = second.up ? new THREE.Vector3(...second.up).normalize() : null
  const upDistance = firstUp && secondUp ? (firstUp.angleTo(secondUp) * 180) / Math.PI : 0
  return directionDistance + upDistance
}
const viewOrientationAnimationDuration = 360
const easeOutCubic = (progress: number) => 1 - Math.pow(1 - progress, 3)
const interpolateOrientation = (from: ViewOrientation, to: ViewOrientation, progress: number) => {
  const quaternion = orientationToQuaternion(from).slerp(orientationToQuaternion(to), progress)
  return createFreeOrientation(
    new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion),
    new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion),
  )
}
const rotateOrientation = (orientation: ViewOrientation, step: ViewRotationStep) => {
  const direction = orientationToViewDirection(orientation)
  const up = orientationToViewUp(orientation)
  const right = new THREE.Vector3().crossVectors(up, direction).normalize()
  if (right.lengthSq() < 0.000001) {
    return orientation
  }

  const rotation = new THREE.Quaternion()
  if (step.horizontal) {
    rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(up, THREE.MathUtils.degToRad(step.horizontal)))
  }
  if (step.vertical) {
    rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(right, THREE.MathUtils.degToRad(step.vertical)))
  }
  if (step.roll) {
    rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(direction, THREE.MathUtils.degToRad(step.roll)))
  }

  return createFreeOrientation(direction.applyQuaternion(rotation), up.applyQuaternion(rotation))
}

type ViewCubeFaceID = HorizontalFace | 'top' | 'bottom'

type ViewCubeFace = {
  color: number
  id: ViewCubeFaceID
  label: string
  orientation: ViewOrientation
  position: [number, number, number]
  rotation: [number, number, number]
}

const viewCubeSize = 1.36
const viewCubeChamferHeight = viewCubeSize * 0.15
const viewCubeHalfSize = viewCubeSize / 2
const viewCubeFaceSize = viewCubeSize - viewCubeChamferHeight * 2
type Point3 = [number, number, number]
const viewAxisDefinitions = [
  { color: 0xe36b5d, direction: new THREE.Vector3(1, 0, 0), label: 'X' },
  { color: 0x6fc782, direction: new THREE.Vector3(0, 0, -1), label: 'Y' },
  { color: 0x6f94e8, direction: new THREE.Vector3(0, 1, 0), label: 'Z' },
] as const
type ChamferedCubeSurface = {
  kind: 'corner' | 'edge' | 'main'
  points: Point3[]
}

const createChamferedCubeGeometry = (size: number, chamferHeight: number) => {
  const half = size / 2
  const inset = half - chamferHeight
  const positions: number[] = []
  const surfaces: ChamferedCubeSurface[] = []
  const edgeKeys = new Set<string>()
  const edgePoints: number[] = []
  const makePoint = (x = 0, y = 0, z = 0): Point3 => [x, y, z]
  const edgeKey = (first: Point3, second: Point3) => {
    const serialize = (point: Point3) => point.map((value) => value.toFixed(5)).join(',')
    const a = serialize(first)
    const b = serialize(second)
    return a < b ? `${a}|${b}` : `${b}|${a}`
  }
  const addEdge = (first: Point3, second: Point3) => {
    const key = edgeKey(first, second)
    if (edgeKeys.has(key)) {
      return
    }
    edgeKeys.add(key)
    edgePoints.push(...first, ...second)
  }
  const addFace = (points: Point3[], kind: ChamferedCubeSurface['kind']) => {
    const center = new THREE.Vector3()
    for (const point of points) {
      center.add(new THREE.Vector3(...point))
    }
    center.divideScalar(points.length)

    const first = new THREE.Vector3(...points[0])
    const second = new THREE.Vector3(...points[1])
    const third = new THREE.Vector3(...points[2])
    const normal = second.clone().sub(first).cross(third.clone().sub(first))
    const facePoints = normal.dot(center) < 0 ? [...points].reverse() : points
    surfaces.push({ kind, points: facePoints })

    for (let index = 1; index < facePoints.length - 1; index += 1) {
      positions.push(...facePoints[0], ...facePoints[index], ...facePoints[index + 1])
    }
    for (let index = 0; index < facePoints.length; index += 1) {
      addEdge(facePoints[index], facePoints[(index + 1) % facePoints.length])
    }
  }

  addFace([makePoint(half, -inset, -inset), makePoint(half, inset, -inset), makePoint(half, inset, inset), makePoint(half, -inset, inset)], 'main')
  addFace([makePoint(-half, -inset, inset), makePoint(-half, inset, inset), makePoint(-half, inset, -inset), makePoint(-half, -inset, -inset)], 'main')
  addFace([makePoint(-inset, half, -inset), makePoint(-inset, half, inset), makePoint(inset, half, inset), makePoint(inset, half, -inset)], 'main')
  addFace([makePoint(-inset, -half, inset), makePoint(-inset, -half, -inset), makePoint(inset, -half, -inset), makePoint(inset, -half, inset)], 'main')
  addFace([makePoint(-inset, -inset, half), makePoint(inset, -inset, half), makePoint(inset, inset, half), makePoint(-inset, inset, half)], 'main')
  addFace([makePoint(inset, -inset, -half), makePoint(-inset, -inset, -half), makePoint(-inset, inset, -half), makePoint(inset, inset, -half)], 'main')

  const buildPoint = (axisA: number, valueA: number, axisB: number, valueB: number, axisC: number, valueC: number) => {
    const point: Point3 = [0, 0, 0]
    point[axisA] = valueA
    point[axisB] = valueB
    point[axisC] = valueC
    return point
  }
  for (const [axisA, axisB, axisC] of [
    [0, 1, 2],
    [0, 2, 1],
    [1, 2, 0],
  ] as const) {
    for (const signA of [-1, 1] as const) {
      for (const signB of [-1, 1] as const) {
        addFace([
          buildPoint(axisA, signA * half, axisB, signB * inset, axisC, -inset),
          buildPoint(axisA, signA * half, axisB, signB * inset, axisC, inset),
          buildPoint(axisA, signA * inset, axisB, signB * half, axisC, inset),
          buildPoint(axisA, signA * inset, axisB, signB * half, axisC, -inset),
        ], 'edge')
      }
    }
  }

  for (const signX of [-1, 1] as const) {
    for (const signY of [-1, 1] as const) {
      for (const signZ of [-1, 1] as const) {
        addFace([
          makePoint(signX * half, signY * inset, signZ * inset),
          makePoint(signX * inset, signY * half, signZ * inset),
          makePoint(signX * inset, signY * inset, signZ * half),
        ], 'corner')
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()

  const edgeGeometry = new THREE.BufferGeometry()
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePoints, 3))

  return { edgeGeometry, geometry, surfaces }
}

const createSurfaceGeometry = (points: Point3[], offset = 0) => {
  const normal = getSurfaceNormal(points)
  const offsetPoints = points.map((point) => new THREE.Vector3(...point).addScaledVector(normal, offset))
  const positions: number[] = []
  for (let index = 1; index < offsetPoints.length - 1; index += 1) {
    positions.push(
      offsetPoints[0].x,
      offsetPoints[0].y,
      offsetPoints[0].z,
      offsetPoints[index].x,
      offsetPoints[index].y,
      offsetPoints[index].z,
      offsetPoints[index + 1].x,
      offsetPoints[index + 1].y,
      offsetPoints[index + 1].z,
    )
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

const getSurfaceNormal = (points: Point3[]) => {
  const first = new THREE.Vector3(...points[0])
  const second = new THREE.Vector3(...points[1])
  const third = new THREE.Vector3(...points[2])
  return second.clone().sub(first).cross(third.clone().sub(first)).normalize()
}

const viewCubeFaces: ViewCubeFace[] = [
  {
    color: 0x9a9f99,
    id: 'front',
    label: '前视图',
    orientation: createOrientation(0, 0),
    position: [0, 0, viewCubeHalfSize],
    rotation: [0, 0, 0],
  },
  {
    color: 0x828981,
    id: 'back',
    label: '后视图',
    orientation: createOrientation(180, 0),
    position: [0, 0, -viewCubeHalfSize],
    rotation: [0, Math.PI, 0],
  },
  {
    color: 0x8e958d,
    id: 'right',
    label: '右视图',
    orientation: createOrientation(90, 0),
    position: [viewCubeHalfSize, 0, 0],
    rotation: [0, Math.PI / 2, 0],
  },
  {
    color: 0x858c84,
    id: 'left',
    label: '左视图',
    orientation: createOrientation(270, 0),
    position: [-viewCubeHalfSize, 0, 0],
    rotation: [0, -Math.PI / 2, 0],
  },
  {
    color: 0xa5aaa3,
    id: 'top',
    label: '上视图',
    orientation: createOrientation(0, 89),
    position: [0, viewCubeHalfSize, 0],
    rotation: [-Math.PI / 2, 0, 0],
  },
  {
    color: 0x747b74,
    id: 'bottom',
    label: '下视图',
    orientation: createOrientation(0, -89),
    position: [0, -viewCubeHalfSize, 0],
    rotation: [Math.PI / 2, 0, 0],
  },
]

const createCanvasLabelTexture = ({
  background,
  color,
  fontSize,
  height = 128,
  label,
  width = 256,
}: {
  background?: string
  color: string
  fontSize: number
  height?: number
  label: string
  width?: number
}) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, width, height)
    if (background) {
      context.fillStyle = background
      context.fillRect(0, 0, width, height)
    }
    context.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineWidth = 4
    context.strokeStyle = 'rgba(17,19,16,0.42)'
    context.fillStyle = color
    context.strokeText(label, width / 2, height / 2 + 3)
    context.fillText(label, width / 2, height / 2 + 3)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const createViewCubeFaceTexture = ({ background, color, label }: { background: number; color: string; label: string }) => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = `#${background.toString(16).padStart(6, '0')}`
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineJoin = 'round'
    context.lineWidth = 12
    context.strokeStyle = 'rgba(245, 240, 226, 0.42)'
    context.fillStyle = color

    let fontSize = 150
    const maxTextWidth = canvas.width * 0.82
    do {
      context.font = `800 ${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      fontSize -= 2
    } while (context.measureText(label).width > maxTextWidth && fontSize > 56)

    context.strokeText(label, canvas.width / 2, canvas.height / 2 + 10)
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 10)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function ViewCube3D({
  animateOrientationChanges,
  onSetOrientation,
  orientation,
}: {
  animateOrientationChanges: boolean
  onSetOrientation: (orientation: ViewOrientation) => void
  orientation: ViewOrientation
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onSetOrientationRef = useRef(onSetOrientation)
  const orientationRef = useRef(orientation)
  const displayedOrientationRef = useRef(orientation)
  const viewStateRef = useRef<{
    animateTo: (orientation: ViewOrientation) => void
    render: (orientation: ViewOrientation) => void
    syncTo: (orientation: ViewOrientation) => void
  } | null>(null)

  useEffect(() => {
    onSetOrientationRef.current = onSetOrientation
  }, [onSetOrientation])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return undefined
    }

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.width = '100%'
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1.7, 1.7, 1.7, -1.7, 0.1, 20)
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const hitMeshes: THREE.Mesh[] = []
    let hoveredSurface: THREE.Mesh | null = null
    let animationFrameID: number | null = null

    const ambient = new THREE.HemisphereLight(0xf2ecdc, 0x252a23, 2.3)
    scene.add(ambient)
    const key = new THREE.DirectionalLight(0xf3ead2, 2.9)
    key.position.set(2.4, 3.2, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x9fb08f, 1.25)
    rim.position.set(-2.5, -1.5, -3)
    scene.add(rim)

    const cubeGroup = new THREE.Group()
    scene.add(cubeGroup)

    const {
      edgeGeometry: cubeEdgeGeometry,
      geometry: cubeGeometry,
      surfaces: cubeSurfaces,
    } = createChamferedCubeGeometry(
      viewCubeSize,
      viewCubeChamferHeight,
    )
    const cubeBody = new THREE.Mesh(
      cubeGeometry,
      new THREE.MeshStandardMaterial({
        color: 0x8f968d,
        flatShading: true,
        metalness: 0.05,
        roughness: 0.72,
      }),
    )
    cubeGroup.add(cubeBody)

    const cubeEdges = new THREE.LineSegments(
      cubeEdgeGeometry,
      new THREE.LineBasicMaterial({ color: 0x242a24, transparent: true, opacity: 0.7 }),
    )
    cubeGroup.add(cubeEdges)

    const bevelDefaultMaterial = new THREE.MeshBasicMaterial({
      color: 0xd7ddcc,
      depthWrite: false,
      opacity: 0,
      side: THREE.DoubleSide,
      transparent: true,
    })
    const bevelHoverMaterial = new THREE.MeshBasicMaterial({
      color: 0xf2f6dd,
      depthTest: false,
      depthWrite: false,
      opacity: 0.94,
      side: THREE.DoubleSide,
      transparent: true,
    })
    for (const surface of cubeSurfaces) {
      if (surface.kind === 'main') {
        continue
      }
      const bevelSurface = new THREE.Mesh(createSurfaceGeometry(surface.points, 0.006), bevelDefaultMaterial)
      bevelSurface.renderOrder = 5
      bevelSurface.userData.defaultMaterial = bevelDefaultMaterial
      bevelSurface.userData.hoverMaterial = bevelHoverMaterial
      bevelSurface.userData.orientation = directionToOrientation(getSurfaceNormal(surface.points))
      cubeGroup.add(bevelSurface)
      hitMeshes.push(bevelSurface)
    }

    const hitMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthWrite: false,
      opacity: 0,
      side: THREE.DoubleSide,
      transparent: true,
    })

    for (const face of viewCubeFaces) {
      const faceTexture = createViewCubeFaceTexture({
        background: face.color,
        color: '#1d211d',
        label: face.label,
      })
      const hoverTexture = createViewCubeFaceTexture({
        background: 0xd7ddcc,
        color: '#141714',
        label: face.label,
      })
      const faceMaterial = new THREE.MeshBasicMaterial({
        map: faceTexture,
        side: THREE.FrontSide,
      })
      const facePlane = new THREE.Mesh(
        new THREE.PlaneGeometry(viewCubeFaceSize, viewCubeFaceSize),
        faceMaterial,
      )
      facePlane.position.set(...face.position)
      facePlane.position.multiplyScalar(1.006)
      facePlane.rotation.set(...face.rotation)
      facePlane.renderOrder = 4
      facePlane.userData.defaultTexture = faceTexture
      facePlane.userData.hoverTexture = hoverTexture
      cubeGroup.add(facePlane)

      const hitPlane = new THREE.Mesh(new THREE.PlaneGeometry(viewCubeFaceSize, viewCubeFaceSize), hitMaterial)
      hitPlane.position.set(...face.position)
      hitPlane.position.multiplyScalar(1.04)
      hitPlane.rotation.set(...face.rotation)
      hitPlane.userData.orientation = face.orientation
      hitPlane.userData.facePlane = facePlane
      cubeGroup.add(hitPlane)
      hitMeshes.push(hitPlane)
    }

    const axisLabel = (label: string, color: number) => {
      const texture = createCanvasLabelTexture({
        color: `#${color.toString(16).padStart(6, '0')}`,
        fontSize: 54,
        height: 96,
        label,
        width: 96,
      })
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, map: texture, transparent: true }))
      sprite.renderOrder = 10
      sprite.scale.set(0.18, 0.18, 1)
      return sprite
    }

    const axisGroup = new THREE.Group()
    const axisCornerOffset = 0.014
    axisGroup.position.set(
      -viewCubeHalfSize - axisCornerOffset,
      -viewCubeHalfSize - axisCornerOffset,
      viewCubeHalfSize + axisCornerOffset,
    )
    cubeGroup.add(axisGroup)

    const createMiniAxis = (label: string, direction: THREE.Vector3, color: number) => {
      const group = new THREE.Group()
      const normalizedDirection = direction.clone().normalize()
      const axisLength = viewCubeFaceSize * 0.54
      const axisMaterial = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 })
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          normalizedDirection.clone().multiplyScalar(axisLength),
        ]),
        axisMaterial,
      )
      line.renderOrder = 9
      group.add(line)

      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.036, 0.11, 24),
        new THREE.MeshBasicMaterial({ color, depthTest: false }),
      )
      arrow.position.copy(normalizedDirection.clone().multiplyScalar(axisLength))
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalizedDirection)
      arrow.renderOrder = 10
      group.add(arrow)

      const labelSprite = axisLabel(label, color)
      labelSprite.position.copy(normalizedDirection.clone().multiplyScalar(axisLength + 0.1))
      labelSprite.scale.set(0.12, 0.12, 1)
      group.add(labelSprite)

      return group
    }

    for (const axis of viewAxisDefinitions) {
      axisGroup.add(createMiniAxis(axis.label, axis.direction, axis.color))
    }

    const updateSize = () => {
      const { height, width } = container.getBoundingClientRect()
      if (width === 0 || height === 0) {
        return
      }
      const aspect = width / height
      const viewHeight = 2.95
      camera.left = (-viewHeight * aspect) / 2
      camera.right = (viewHeight * aspect) / 2
      camera.top = viewHeight / 2
      camera.bottom = -viewHeight / 2
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }

    const render = (nextOrientation: ViewOrientation) => {
      displayedOrientationRef.current = nextOrientation
      updateSize()
      const direction = orientationToViewDirection(nextOrientation)
      const up = nextOrientation.up
        ? new THREE.Vector3(...nextOrientation.up).normalize()
        : new THREE.Vector3(
            ...(Math.abs(direction.y) > 0.98
              ? ([0, 0, direction.y > 0 ? -1 : 1] as [number, number, number])
              : ([0, 1, 0] as [number, number, number])),
          )
      camera.position.copy(direction.multiplyScalar(5))
      camera.up.copy(up)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()
      renderer.render(scene, camera)
    }

    const cancelAnimation = () => {
      if (animationFrameID === null) {
        return
      }
      window.cancelAnimationFrame(animationFrameID)
      animationFrameID = null
    }

    const animateTo = (nextOrientation: ViewOrientation) => {
      cancelAnimation()
      const startOrientation = displayedOrientationRef.current
      if (orientationDistance(startOrientation, nextOrientation) < 0.2) {
        render(nextOrientation)
        return
      }
      const startedAt = performance.now()
      const step = (now: number) => {
        const progress = Math.min((now - startedAt) / viewOrientationAnimationDuration, 1)
        render(interpolateOrientation(startOrientation, nextOrientation, easeOutCubic(progress)))
        if (progress < 1) {
          animationFrameID = window.requestAnimationFrame(step)
          return
        }
        animationFrameID = null
        render(nextOrientation)
      }
      animationFrameID = window.requestAnimationFrame(step)
    }

    const syncTo = (nextOrientation: ViewOrientation) => {
      cancelAnimation()
      render(nextOrientation)
    }

    const getHitFace = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const [hit] = raycaster.intersectObjects(hitMeshes, false)
      return hit
    }

    const setHoveredSurface = (surface: THREE.Mesh | null) => {
      if (hoveredSurface === surface) {
        return
      }
      if (hoveredSurface) {
        const defaultTexture = hoveredSurface.userData.defaultTexture as THREE.Texture | undefined
        const defaultMaterial = hoveredSurface.userData.defaultMaterial as THREE.Material | undefined
        if (defaultTexture) {
          const material = hoveredSurface.material as THREE.MeshBasicMaterial
          material.map = defaultTexture
          material.needsUpdate = true
        }
        if (defaultMaterial) {
          hoveredSurface.material = defaultMaterial
        }
      }
      hoveredSurface = surface
      if (hoveredSurface) {
        const hoverTexture = hoveredSurface.userData.hoverTexture as THREE.Texture | undefined
        const hoverMaterial = hoveredSurface.userData.hoverMaterial as THREE.Material | undefined
        if (hoverTexture) {
          const material = hoveredSurface.material as THREE.MeshBasicMaterial
          material.map = hoverTexture
          material.needsUpdate = true
        }
        if (hoverMaterial) {
          hoveredSurface.material = hoverMaterial
        }
      }
      renderer.domElement.style.cursor = surface ? 'pointer' : 'default'
      render(displayedOrientationRef.current)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const hit = getHitFace(event)
      setHoveredSurface((hit?.object.userData.facePlane as THREE.Mesh | undefined) ?? (hit?.object as THREE.Mesh | undefined) ?? null)
    }

    const handlePointerLeave = () => {
      setHoveredSurface(null)
    }

    const handlePointerDown = (event: PointerEvent) => {
      const hit = getHitFace(event)
      if (!hit) {
        return
      }
      const nextOrientation = hit.object.userData.orientation
      if (isViewOrientation(nextOrientation)) {
        onSetOrientationRef.current(nextOrientation)
      }
    }

    viewStateRef.current = { animateTo, render, syncTo }
    render(orientationRef.current)

    const resizeObserver = new ResizeObserver(() => render(displayedOrientationRef.current))
    resizeObserver.observe(container)
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)

    return () => {
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      cancelAnimation()
      viewStateRef.current = null

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
        for (const value of Object.values(disposableObject.userData)) {
          if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
            value.dispose()
            disposedTextures.add(value)
          } else if (value instanceof THREE.Material) {
            disposeMaterial(value)
          }
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

  useEffect(() => {
    orientationRef.current = orientation
    if (animateOrientationChanges) {
      viewStateRef.current?.animateTo(orientation)
      return
    }
    viewStateRef.current?.syncTo(orientation)
  }, [animateOrientationChanges, orientation])

  return <div ref={containerRef} aria-label="View cube" className="absolute left-1/2 top-1/2 z-10 size-[112px] -translate-x-1/2 -translate-y-1/2" />
}

function ViewController({
  animateViewCubeOrientation,
  orientation,
  onFlip,
  onSetOrientation,
  onStep,
}: {
  animateViewCubeOrientation: boolean
  orientation: ViewOrientation
  onFlip: () => void
  onSetOrientation: (orientation: ViewOrientation) => void
  onStep: (step: ViewRotationStep) => void
}) {
  const arrowButtonClass =
    'absolute z-30 grid size-6 place-items-center outline-none transition hover:scale-110 focus-visible:outline-none'
  const verticalArrowClass = 'block h-3 w-5 bg-[#9a9f99] transition group-hover:bg-[#c5c7c0]'
  const horizontalArrowClass = 'block h-5 w-3 bg-[#9a9f99] transition group-hover:bg-[#c5c7c0]'
  const arcButtonClass =
    'absolute z-20 grid h-[30px] w-[35px] place-items-center text-[#9a9f99] outline-none transition hover:scale-105 hover:text-[#c5c7c0] focus-visible:outline-none'

  return (
    <div
      aria-label="View orientation controls"
      className="absolute right-4 top-4 z-20 hidden size-[135px] select-none text-[#d8d1bf] sm:block"
    >
      <button
        aria-label="Tilt view up"
        className={`${arrowButtonClass} group left-1/2 top-0 -translate-x-1/2`}
        onClick={() => onStep({ vertical: 45 })}
        title="Tilt view up"
        type="button"
      >
        <span className={verticalArrowClass} style={{ clipPath: 'polygon(50% 0, 0 100%, 100% 100%)' }} />
      </button>

      <button
        aria-label="Rotate view left 45 degrees"
        className={`${arrowButtonClass} group left-0 top-1/2 -translate-y-1/2`}
        onClick={() => onStep({ horizontal: 45 })}
        title="Rotate view left 45 degrees"
        type="button"
      >
        <span className={horizontalArrowClass} style={{ clipPath: 'polygon(0 50%, 100% 0, 100% 100%)' }} />
      </button>

      <button
        aria-label="Rotate view right 45 degrees"
        className={`${arrowButtonClass} group right-0 top-1/2 -translate-y-1/2`}
        onClick={() => onStep({ horizontal: -45 })}
        title="Rotate view right 45 degrees"
        type="button"
      >
        <span className={horizontalArrowClass} style={{ clipPath: 'polygon(100% 50%, 0 0, 0 100%)' }} />
      </button>

      <button
        aria-label="Tilt view down"
        className={`${arrowButtonClass} group bottom-0 left-1/2 -translate-x-1/2`}
        onClick={() => onStep({ vertical: -45 })}
        title="Tilt view down"
        type="button"
      >
        <span className={verticalArrowClass} style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
      </button>

      <button
        aria-label="Rotate view left"
        className={`${arcButtonClass} left-[18px] top-3.5`}
        onClick={() => onStep({ roll: -45 })}
        title="Rotate view left"
        type="button"
      >
        <svg aria-hidden="true" className="size-full" viewBox="6 2 58 50">
          <path
            d="M48.6 9.5 A61 61 0 0 0 19.4 29.9 L13.9 25.6 L11.1 48.8 L32.9 40.4 L27.3 36.1 A51 51 0 0 1 51.7 19 Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <button
        aria-label="Rotate view right"
        className={`${arcButtonClass} right-[18px] top-3.5`}
        onClick={() => onStep({ roll: 45 })}
        title="Rotate view right"
        type="button"
      >
        <svg aria-hidden="true" className="size-full" viewBox="71 2 58 50">
          <path
            d="M86.4 9.5 A61 61 0 0 1 115.6 29.9 L121.1 25.6 L123.9 48.8 L102.1 40.4 L107.7 36.1 A51 51 0 0 0 83.3 19 Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <button
        aria-label="Flip view"
        className="absolute right-0 top-0 z-30 grid size-5 place-items-center outline-none transition hover:scale-110 focus-visible:outline-none"
        onClick={onFlip}
        title="Flip view"
        type="button"
      >
        <span className="block size-4 rounded-full bg-[#9a9f99] transition hover:bg-[#c5c7c0]" />
      </button>

      <ViewCube3D
        animateOrientationChanges={animateViewCubeOrientation}
        onSetOrientation={onSetOrientation}
        orientation={orientation}
      />
    </div>
  )
}

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
      ...(orientation.up ? { up: orientation.up } : {}),
    }
    setAnimateViewCubeOrientation(true)
    setViewOrientation(nextOrientation)
    document
      .querySelector('[data-model-preview]')
      ?.dispatchEvent(new CustomEvent('litecad:set-view', { detail: { orientation: nextOrientation } }))
  }
  const stepCanvasOrientation = (step: ViewRotationStep) => {
    applyCanvasOrientation(rotateOrientation(viewOrientation, step))
  }
  const flipCanvasOrientation = () => {
    applyCanvasOrientation(rotateOrientation(viewOrientation, { horizontal: 180 }))
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
