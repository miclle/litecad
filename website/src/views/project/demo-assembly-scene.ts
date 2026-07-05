import * as THREE from 'three'

export type DemoAssemblyScene = {
  assembly: THREE.Group
  draggableMeshes: THREE.Object3D[]
}

export function createDemoAssemblyScene(): DemoAssemblyScene {
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

  return { assembly, draggableMeshes }
}
