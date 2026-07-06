import { useEffect, useRef, type CSSProperties } from 'react'
import * as THREE from 'three'

import { disposeObject3DResources } from './three-object-resources'
import { viewAxisDefinitions } from './view-axis'
import { createCanvasLabelTexture, createViewCubeFaceTexture } from './view-cube-textures'
import {
  createChamferedCubeGeometry,
  createSurfaceGeometry,
  createTexturedSurfaceGeometry,
  getSurfaceNormal,
  viewCubeChamferHeight,
  viewCubeCornerChamferHeight,
  viewCubeFaces,
  viewCubeHalfSize,
  viewCubeSize,
  type ChamferedCubeSurface,
} from './view-cube'
import {
  createSquaredOrientation,
  easeOutCubic,
  interpolateOrientation,
  orientationDistance,
  orientationToViewDirection,
  rotateOrientationToDirection,
  viewOrientationAnimationDuration,
  type ViewOrientation,
  type ViewRotationStep,
} from './view-orientation'

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
      viewCubeCornerChamferHeight,
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
    const cornerDefaultMaterial = new THREE.MeshBasicMaterial({
      color: 0xa8afa5,
      depthWrite: false,
      opacity: 0.88,
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
      const bevelSurface = new THREE.Mesh(
        createSurfaceGeometry(surface.points, surface.kind === 'corner' ? 0.012 : 0.006),
        surface.kind === 'corner' ? cornerDefaultMaterial : bevelDefaultMaterial,
      )
      bevelSurface.renderOrder = 5
      bevelSurface.userData.defaultMaterial = surface.kind === 'corner' ? cornerDefaultMaterial : bevelDefaultMaterial
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

    const findMainSurface = (face: (typeof viewCubeFaces)[number]) => {
      const faceDirection = orientationToViewDirection(face.orientation)
      return cubeSurfaces.find(
        (surface): surface is ChamferedCubeSurface =>
          surface.kind === 'main' && getSurfaceNormal(surface.points).dot(faceDirection) > 0.99,
      )
    }

    for (const face of viewCubeFaces) {
      const mainSurface = findMainSurface(face)
      if (!mainSurface) {
        continue
      }
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
        createTexturedSurfaceGeometry(mainSurface.points, face.id, 0.012),
        faceMaterial,
      )
      facePlane.renderOrder = 4
      facePlane.userData.defaultTexture = faceTexture
      facePlane.userData.hoverTexture = hoverTexture
      cubeGroup.add(facePlane)

      const hitPlane = new THREE.Mesh(createSurfaceGeometry(mainSurface.points, 0.028), hitMaterial)
      hitPlane.userData.viewDirection = orientationToViewDirection(face.orientation)
      hitPlane.userData.facePlane = facePlane
      cubeGroup.add(hitPlane)
      hitMeshes.push(hitPlane)
    }

    const axisLabel = (label: string, color: number) => {
      const texture = createCanvasLabelTexture({
        color: `#${color.toString(16).padStart(6, '0')}`,
        fontSize: 82,
        height: 96,
        label,
        width: 96,
      })
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: true, depthWrite: false, map: texture, transparent: true }))
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
      const axisLength = viewCubeSize * 0.85
      const axisMaterial = new THREE.MeshBasicMaterial({ color, depthTest: true })
      const line = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, axisLength, 16),
        axisMaterial,
      )
      line.position.copy(normalizedDirection.clone().multiplyScalar(axisLength / 2))
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalizedDirection)
      line.renderOrder = 9
      group.add(line)

      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.046, 0.13, 24),
        new THREE.MeshBasicMaterial({ color, depthTest: true }),
      )
      arrow.position.copy(normalizedDirection.clone().multiplyScalar(axisLength))
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalizedDirection)
      arrow.renderOrder = 10
      group.add(arrow)

      const labelSprite = axisLabel(label, color)
      labelSprite.position.copy(normalizedDirection.clone().multiplyScalar(axisLength + 0.11))
      labelSprite.scale.set(0.168, 0.168, 1)
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
        const currentOrientation = displayedOrientationRef.current
        const currentDirection = orientationToViewDirection(currentOrientation)
        const isFacingTarget =
          currentDirection.angleTo(nextDirection.clone().normalize()) < THREE.MathUtils.degToRad(0.8)
        const nextOrientation = isFacingTarget
          ? createSquaredOrientation(currentOrientation, nextDirection)
          : rotateOrientationToDirection(currentOrientation, nextDirection)
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

      disposeObject3DResources(scene)
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

  return <div ref={containerRef} aria-label="View cube" className="absolute left-1/2 top-1/2 z-10 size-[128px] -translate-x-1/2 -translate-y-1/2" />
}

export function ViewController({
  animateViewCubeOrientation,
  className = '',
  orientation,
  onFlip,
  onSetOrientation,
  onStep,
  style,
}: {
  animateViewCubeOrientation: boolean
  className?: string
  orientation: ViewOrientation
  onFlip: () => void
  onSetOrientation: (orientation: ViewOrientation) => void
  onStep: (step: ViewRotationStep) => void
  style?: CSSProperties
}) {
  const arrowButtonClass =
    'absolute z-30 grid size-6 place-items-center outline-none transition hover:scale-110 focus-visible:outline-none'
  const verticalArrowClass = 'block h-3 w-5 bg-[#94a3b8] transition group-hover:bg-[#475569]'
  const horizontalArrowClass = 'block h-5 w-3 bg-[#94a3b8] transition group-hover:bg-[#475569]'
  const arcButtonClass =
    'absolute z-20 grid h-[30px] w-[35px] place-items-center text-[#94a3b8] outline-none transition hover:scale-105 hover:text-[#475569] focus-visible:outline-none'

  return (
    <div
      aria-label="View orientation controls"
      className={`absolute right-4 top-4 z-20 hidden size-[135px] select-none text-[#1f2937] sm:block ${className}`}
      style={style}
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
        <span className="block size-4 rounded-full bg-[#94a3b8] transition hover:bg-[#475569]" />
      </button>

      <ViewCube3D
        animateOrientationChanges={animateViewCubeOrientation}
        onSetOrientation={onSetOrientation}
        orientation={orientation}
      />
    </div>
  )
}
