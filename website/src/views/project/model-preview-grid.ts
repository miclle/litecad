import * as THREE from 'three'

const gridPlaneOffset = 0.015

export const modelPreviewGridPlaneOffset = gridPlaneOffset

export const niceGridStep = (radius: number) => {
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

export const createGridLineGeometry = (size: number, step: number, shouldIncludeLine: (index: number) => boolean) => {
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

export const createWorldGrid = (radius: number) => {
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
