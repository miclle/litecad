import * as THREE from 'three'

import { createOrientation, type ViewOrientation } from './view-orientation'

type HorizontalFace = 'front' | 'right' | 'back' | 'left'

export type ViewCubeFaceID = HorizontalFace | 'top' | 'bottom'

export type ViewCubeFace = {
  color: number
  id: ViewCubeFaceID
  label: string
  orientation: ViewOrientation
  position: [number, number, number]
  rotation: [number, number, number]
}

export const viewCubeSize = 1.36
export const viewCubeChamferHeight = viewCubeSize * 0.15
export const viewCubeHalfSize = viewCubeSize / 2
export const viewCubeFaceSize = viewCubeSize - viewCubeChamferHeight * 2

export type Point3 = [number, number, number]
export type ChamferedCubeSurface = {
  kind: 'corner' | 'edge' | 'main'
  points: Point3[]
}

export const createChamferedCubeGeometry = (size: number, chamferHeight: number) => {
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

export const getSurfaceNormal = (points: Point3[]) => {
  const first = new THREE.Vector3(...points[0])
  const second = new THREE.Vector3(...points[1])
  const third = new THREE.Vector3(...points[2])
  return second.clone().sub(first).cross(third.clone().sub(first)).normalize()
}

export const createSurfaceGeometry = (points: Point3[], offset = 0) => {
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
