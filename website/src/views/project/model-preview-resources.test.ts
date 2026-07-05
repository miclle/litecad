import { describe, expect, test, vi } from 'vitest'
import * as THREE from 'three'

import { disposeObject3DResources } from './model-preview-resources'

describe('model preview resources', () => {
  test('disposes shared geometries, materials, and textures once', () => {
    const scene = new THREE.Scene()
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const texture = new THREE.Texture()
    const material = new THREE.MeshBasicMaterial({ map: texture })
    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')
    const textureDispose = vi.spyOn(texture, 'dispose')

    scene.add(new THREE.Mesh(geometry, material))
    scene.add(new THREE.Mesh(geometry, material))

    disposeObject3DResources(scene)

    expect(geometryDispose).toHaveBeenCalledTimes(1)
    expect(materialDispose).toHaveBeenCalledTimes(1)
    expect(textureDispose).toHaveBeenCalledTimes(1)
  })

  test('disposes material arrays', () => {
    const scene = new THREE.Scene()
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const firstMaterial = new THREE.MeshBasicMaterial()
    const secondMaterial = new THREE.MeshBasicMaterial()
    const firstDispose = vi.spyOn(firstMaterial, 'dispose')
    const secondDispose = vi.spyOn(secondMaterial, 'dispose')

    scene.add(new THREE.Mesh(geometry, [firstMaterial, secondMaterial]))

    disposeObject3DResources(scene)

    expect(firstDispose).toHaveBeenCalledTimes(1)
    expect(secondDispose).toHaveBeenCalledTimes(1)
  })
})
