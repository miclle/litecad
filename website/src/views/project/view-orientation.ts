import * as THREE from 'three'

export type ViewOrientation = {
  direction?: [number, number, number]
  pitch: number
  rotationStep?: ViewRotationStep
  up?: [number, number, number]
  yaw: number
}

export type ViewRotationStep = {
  horizontal?: number
  roll?: number
  vertical?: number
}

export const initialViewOrientation: ViewOrientation = { yaw: 38, pitch: 27 }

const clampPitch = (pitch: number) => Math.max(-89, Math.min(89, pitch))
const normalizeYaw = (yaw: number) => ((yaw % 360) + 360) % 360

export const createOrientation = (yaw: number, pitch: number): ViewOrientation => ({
  yaw: normalizeYaw(yaw),
  pitch: clampPitch(pitch),
})

export const isViewOrientation = (orientation: unknown): orientation is ViewOrientation => {
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
  const step = candidate.rotationStep
  const hasValidRotationStep =
    step === undefined ||
    (typeof step === 'object' &&
      step !== null &&
      (step.horizontal === undefined || Number.isFinite(step.horizontal)) &&
      (step.roll === undefined || Number.isFinite(step.roll)) &&
      (step.vertical === undefined || Number.isFinite(step.vertical)))
  return Number.isFinite(candidate.yaw) && Number.isFinite(candidate.pitch) && hasValidDirection && hasValidUp && hasValidRotationStep
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

export const orientationToViewDirection = (orientation: ViewOrientation) =>
  orientation.direction ? new THREE.Vector3(...orientation.direction).normalize() : orientationToDirection(orientation)

export const fallbackUpForDirection = (direction: THREE.Vector3) =>
  new THREE.Vector3(
    ...(Math.abs(direction.y) > 0.98
      ? ([0, 0, direction.y > 0 ? -1 : 1] as [number, number, number])
      : ([0, 1, 0] as [number, number, number])),
  )

export const orientationToViewUp = (orientation: ViewOrientation) =>
  (orientation.up ? new THREE.Vector3(...orientation.up) : fallbackUpForDirection(orientationToViewDirection(orientation))).normalize()

export const directionToOrientation = (direction: THREE.Vector3) => {
  const normalizedDirection = direction.clone().normalize()
  return createOrientation(
    (Math.atan2(normalizedDirection.x, normalizedDirection.z) * 180) / Math.PI,
    (Math.asin(THREE.MathUtils.clamp(normalizedDirection.y, -1, 1)) * 180) / Math.PI,
  )
}

export const cameraToOrientation = (camera: THREE.Camera, target: THREE.Vector3): ViewOrientation => {
  const direction = camera.position.clone().sub(target).normalize()
  const orientation = directionToOrientation(direction)
  const up = camera.up.clone().normalize()
  return { ...orientation, direction: [direction.x, direction.y, direction.z], up: [up.x, up.y, up.z] }
}

export const createFreeOrientation = (direction: THREE.Vector3, up: THREE.Vector3): ViewOrientation => {
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

export const orientationDistance = (first: ViewOrientation, second: ViewOrientation) => {
  const firstDirection = orientationToViewDirection(first)
  const secondDirection = orientationToViewDirection(second)
  const directionDistance = (firstDirection.angleTo(secondDirection) * 180) / Math.PI
  const firstUp = first.up ? new THREE.Vector3(...first.up).normalize() : null
  const secondUp = second.up ? new THREE.Vector3(...second.up).normalize() : null
  const upDistance = firstUp && secondUp ? (firstUp.angleTo(secondUp) * 180) / Math.PI : 0
  return directionDistance + upDistance
}

export const viewOrientationAnimationDuration = 360
export const easeOutCubic = (progress: number) => 1 - Math.pow(1 - progress, 3)

export const interpolateOrientation = (from: ViewOrientation, to: ViewOrientation, progress: number) => {
  if (to.rotationStep) {
    return rotateOrientation(from, {
      horizontal: to.rotationStep.horizontal === undefined ? undefined : to.rotationStep.horizontal * progress,
      roll: to.rotationStep.roll === undefined ? undefined : to.rotationStep.roll * progress,
      vertical: to.rotationStep.vertical === undefined ? undefined : to.rotationStep.vertical * progress,
    })
  }
  const quaternion = orientationToQuaternion(from).slerp(orientationToQuaternion(to), progress)
  return createFreeOrientation(
    new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion),
    new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion),
  )
}

export const rotateOrientation = (orientation: ViewOrientation, step: ViewRotationStep) => {
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

export const rotateOrientationToDirection = (orientation: ViewOrientation, targetDirection: THREE.Vector3) => {
  const direction = orientationToViewDirection(orientation)
  const up = orientationToViewUp(orientation)
  const normalizedTarget = targetDirection.clone().normalize()
  if (normalizedTarget.lengthSq() < 0.000001) {
    return orientation
  }
  const dot = THREE.MathUtils.clamp(direction.dot(normalizedTarget), -1, 1)
  if (Math.acos(dot) < THREE.MathUtils.degToRad(0.2)) {
    return orientation
  }
  const rotation =
    dot < -0.999999
      ? new THREE.Quaternion().setFromAxisAngle(up, Math.PI)
      : new THREE.Quaternion().setFromUnitVectors(direction, normalizedTarget)

  return createFreeOrientation(direction.applyQuaternion(rotation), up.applyQuaternion(rotation))
}
