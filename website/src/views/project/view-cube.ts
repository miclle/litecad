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
export const viewCubeCornerChamferScale = 1.35
export const viewCubeCornerChamferHeight = viewCubeChamferHeight * viewCubeCornerChamferScale
export const viewCubeHalfSize = viewCubeSize / 2
export const viewCubeFaceSize = viewCubeSize - viewCubeChamferHeight * 2

export type Point3 = [number, number, number]
export type ChamferedCubeSurface = {
  kind: 'corner' | 'edge' | 'main'
  points: Point3[]
}

type ClipPlane = {
  constant: number
  kind: ChamferedCubeSurface['kind']
  normal: THREE.Vector3
}

const serializePoint = (point: THREE.Vector3) => [point.x, point.y, point.z].map((value) => value.toFixed(5)).join(',')

const planeIntersection = (first: ClipPlane, second: ClipPlane, third: ClipPlane) => {
  const secondThird = new THREE.Vector3().crossVectors(second.normal, third.normal)
  const denominator = first.normal.dot(secondThird)
  if (Math.abs(denominator) < 0.000001) {
    return null
  }
  return secondThird
    .multiplyScalar(first.constant)
    .add(new THREE.Vector3().crossVectors(third.normal, first.normal).multiplyScalar(second.constant))
    .add(new THREE.Vector3().crossVectors(first.normal, second.normal).multiplyScalar(third.constant))
    .divideScalar(denominator)
}

const sortFacePoints = (points: THREE.Vector3[], normal: THREE.Vector3) => {
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length)
  const referenceAxis = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const tangent = new THREE.Vector3().crossVectors(referenceAxis, normal).normalize()
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize()

  return [...points].sort((first, second) => {
    const firstOffset = first.clone().sub(center)
    const secondOffset = second.clone().sub(center)
    return (
      Math.atan2(firstOffset.dot(bitangent), firstOffset.dot(tangent)) -
      Math.atan2(secondOffset.dot(bitangent), secondOffset.dot(tangent))
    )
  })
}

export const createChamferedCubeGeometry = (
  size: number,
  chamferHeight: number,
  cornerChamferHeight = chamferHeight,
) => {
  const half = size / 2
  const inset = half - chamferHeight
  const cornerInset = half - Math.min(cornerChamferHeight, half * 0.82)
  const positions: number[] = []
  const surfaces: ChamferedCubeSurface[] = []
  const edgeKeys = new Set<string>()
  const edgePoints: number[] = []
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

  const planes: ClipPlane[] = []
  for (const axis of [0, 1, 2] as const) {
    for (const sign of [-1, 1] as const) {
      const normal = new THREE.Vector3()
      normal.setComponent(axis, sign)
      planes.push({ constant: half, kind: 'main', normal })
    }
  }
  for (const [axisA, axisB] of [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as const) {
    for (const signA of [-1, 1] as const) {
      for (const signB of [-1, 1] as const) {
        const normal = new THREE.Vector3()
        normal.setComponent(axisA, signA)
        normal.setComponent(axisB, signB)
        planes.push({ constant: half + inset, kind: 'edge', normal })
      }
    }
  }
  for (const signX of [-1, 1] as const) {
    for (const signY of [-1, 1] as const) {
      for (const signZ of [-1, 1] as const) {
        planes.push({
          constant: half + cornerInset * 2,
          kind: 'corner',
          normal: new THREE.Vector3(signX, signY, signZ),
        })
      }
    }
  }

  const pointsByKey = new Map<string, THREE.Vector3>()
  for (let first = 0; first < planes.length - 2; first += 1) {
    for (let second = first + 1; second < planes.length - 1; second += 1) {
      for (let third = second + 1; third < planes.length; third += 1) {
        const point = planeIntersection(planes[first], planes[second], planes[third])
        if (!point) {
          continue
        }
        const isInside = planes.every((plane) => plane.normal.dot(point) <= plane.constant + 0.00001)
        if (isInside) {
          pointsByKey.set(serializePoint(point), point)
        }
      }
    }
  }

  const points = [...pointsByKey.values()]
  for (const plane of planes) {
    const planePoints = points.filter((point) => Math.abs(plane.normal.dot(point) - plane.constant) < 0.00001)
    if (planePoints.length >= 3) {
      addFace(
        sortFacePoints(planePoints, plane.normal).map((point) => [point.x, point.y, point.z] as Point3),
        plane.kind,
      )
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

const viewCubeFaceUVAxes: Record<ViewCubeFaceID, { u: [number, number, number]; v: [number, number, number] }> = {
  back: { u: [-1, 0, 0], v: [0, 1, 0] },
  bottom: { u: [1, 0, 0], v: [0, 0, 1] },
  front: { u: [1, 0, 0], v: [0, 1, 0] },
  left: { u: [0, 0, 1], v: [0, 1, 0] },
  right: { u: [0, 0, -1], v: [0, 1, 0] },
  top: { u: [1, 0, 0], v: [0, 0, -1] },
}

export const createTexturedSurfaceGeometry = (points: Point3[], faceID: ViewCubeFaceID, offset = 0) => {
  const normal = getSurfaceNormal(points)
  const offsetPoints = points.map((point) => new THREE.Vector3(...point).addScaledVector(normal, offset))
  const axes = viewCubeFaceUVAxes[faceID]
  const uAxis = new THREE.Vector3(...axes.u)
  const vAxis = new THREE.Vector3(...axes.v)
  const projected = offsetPoints.map((point) => ({ point, u: point.dot(uAxis), v: point.dot(vAxis) }))
  const minU = Math.min(...projected.map((point) => point.u))
  const maxU = Math.max(...projected.map((point) => point.u))
  const minV = Math.min(...projected.map((point) => point.v))
  const maxV = Math.max(...projected.map((point) => point.v))
  const positions: number[] = []
  const uvs: number[] = []
  const pushVertex = ({ point, u, v }: (typeof projected)[number]) => {
    positions.push(point.x, point.y, point.z)
    uvs.push((u - minU) / (maxU - minU || 1), (v - minV) / (maxV - minV || 1))
  }
  for (let index = 1; index < projected.length - 1; index += 1) {
    pushVertex(projected[0])
    pushVertex(projected[index])
    pushVertex(projected[index + 1])
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

export const viewCubeFaces: ViewCubeFace[] = [
  {
    color: 0xa9aea8,
    id: 'front',
    label: 'Front',
    orientation: createOrientation(0, 0),
    position: [0, 0, viewCubeHalfSize],
    rotation: [0, 0, 0],
  },
  {
    color: 0xa2a99f,
    id: 'back',
    label: 'Back',
    orientation: createOrientation(180, 0),
    position: [0, 0, -viewCubeHalfSize],
    rotation: [0, Math.PI, 0],
  },
  {
    color: 0xa0a79f,
    id: 'right',
    label: 'Right',
    orientation: createOrientation(90, 0),
    position: [viewCubeHalfSize, 0, 0],
    rotation: [0, Math.PI / 2, 0],
  },
  {
    color: 0x989f97,
    id: 'left',
    label: 'Left',
    orientation: createOrientation(270, 0),
    position: [-viewCubeHalfSize, 0, 0],
    rotation: [0, -Math.PI / 2, 0],
  },
  {
    color: 0xb4bab2,
    id: 'top',
    label: 'Top',
    orientation: createOrientation(0, 89),
    position: [0, viewCubeHalfSize, 0],
    rotation: [-Math.PI / 2, 0, 0],
  },
  {
    color: 0xa0a79d,
    id: 'bottom',
    label: 'Bottom',
    orientation: createOrientation(0, -89),
    position: [0, -viewCubeHalfSize, 0],
    rotation: [Math.PI / 2, 0, 0],
  },
]
