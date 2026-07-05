import * as THREE from 'three'

export const viewAxisDefinitions = [
  { color: 0xe36b5d, direction: new THREE.Vector3(1, 0, 0), label: 'X' },
  { color: 0x6fc782, direction: new THREE.Vector3(0, 0, -1), label: 'Y' },
  { color: 0x6f94e8, direction: new THREE.Vector3(0, 1, 0), label: 'Z' },
] as const
