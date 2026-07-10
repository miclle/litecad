import { renderHook } from '@testing-library/react'
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { useModelPreviewResources } from './use-model-preview-resources'

describe('useModelPreviewResources', () => {
  it('rejects and disposes objects loaded by a stale scene generation', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial()
    const disposeGeometry = vi.spyOn(geometry, 'dispose')
    const disposeMaterial = vi.spyOn(material, 'dispose')
    const staleObject = new THREE.Mesh(geometry, material)
    const { result } = renderHook(() => useModelPreviewResources())

    const staleGeneration = result.current.beginGeneration()
    result.current.beginGeneration()

    expect(result.current.acceptLoadedObject(staleGeneration, staleObject)).toBe(false)
    expect(disposeGeometry).toHaveBeenCalledTimes(1)
    expect(disposeMaterial).toHaveBeenCalledTimes(1)
  })

  it('resets model, node, and base-transform maps together', () => {
    const { result } = renderHook(() => useModelPreviewResources())
    result.current.previewObjectsByModelIdRef.current.set('model_one', new THREE.Group())
    result.current.previewObjectsByNodeIdRef.current.set('node_one', new THREE.Group())
    result.current.basePositionsByObjectIdRef.current.set('node_one', new THREE.Vector3())

    result.current.resetResourceMaps()

    expect(result.current.previewObjectsByModelIdRef.current.size).toBe(0)
    expect(result.current.previewObjectsByNodeIdRef.current.size).toBe(0)
    expect(result.current.basePositionsByObjectIdRef.current.size).toBe(0)
  })
})
