import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { viewAxisDefinitions } from './view-axis'
import {
  createOrientation,
  easeOutCubic,
  interpolateOrientation,
  orientationDistance,
  orientationToViewDirection,
  rotateOrientationToDirection,
  viewOrientationAnimationDuration,
  type ViewOrientation,
  type ViewRotationStep,
} from './view-orientation'

type HorizontalFace = 'front' | 'right' | 'back' | 'left'

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

export const viewCubeFaces: ViewCubeFace[] = [
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
      bevelSurface.userData.viewDirection = getSurfaceNormal(surface.points)
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
      hitPlane.userData.viewDirection = orientationToViewDirection(face.orientation)
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
      const nextDirection = hit.object.userData.viewDirection
      if (nextDirection instanceof THREE.Vector3) {
        const nextOrientation = rotateOrientationToDirection(displayedOrientationRef.current, nextDirection)
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

export function ViewController({
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
