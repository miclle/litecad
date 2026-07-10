import { useCallback, useRef } from 'react'
import * as THREE from 'three'

import type { CADTranslation } from './cad-document-transforms'
import { disposeObject3DResources } from './three-object-resources'

export function useModelPreviewResources() {
  const generationRef = useRef(0)
  const basePositionsByObjectIdRef = useRef(new Map<string, THREE.Vector3>())
  const baseTranslationsByObjectIdRef = useRef(new Map<string, CADTranslation>())
  const baseUsesCADOrientationByObjectIdRef = useRef(new Map<string, boolean>())
  const previewObjectsByModelIdRef = useRef(new Map<string, THREE.Object3D>())
  const previewObjectsByNodeIdRef = useRef(new Map<string, THREE.Object3D>())

  const resetResourceMaps = useCallback(() => {
    basePositionsByObjectIdRef.current = new Map()
    baseTranslationsByObjectIdRef.current = new Map()
    baseUsesCADOrientationByObjectIdRef.current = new Map()
    previewObjectsByModelIdRef.current = new Map()
    previewObjectsByNodeIdRef.current = new Map()
  }, [])

  const beginGeneration = useCallback(() => {
    generationRef.current += 1
    resetResourceMaps()
    return generationRef.current
  }, [resetResourceMaps])

  const acceptLoadedObject = useCallback((generation: number, object: THREE.Object3D) => {
    if (generation === generationRef.current) {
      return true
    }
    disposeObject3DResources(object)
    return false
  }, [])

  const invalidateGeneration = useCallback(() => {
    generationRef.current += 1
    resetResourceMaps()
  }, [resetResourceMaps])

  return {
    acceptLoadedObject,
    basePositionsByObjectIdRef,
    baseTranslationsByObjectIdRef,
    baseUsesCADOrientationByObjectIdRef,
    beginGeneration,
    invalidateGeneration,
    previewObjectsByModelIdRef,
    previewObjectsByNodeIdRef,
    resetResourceMaps,
  }
}
