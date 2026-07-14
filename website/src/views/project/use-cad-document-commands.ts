import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  addProjectCADModelBoxUnion,
	deleteProjectCADOccurrence,
  deleteProjectCADNode,
	duplicateProjectCADOccurrence,
	moveProjectCADOccurrence,
  redoProjectCADDocument,
  undoProjectCADDocument,
  updateProjectCADNodeTransform,
	updateProjectCADOccurrence,
} from 'src/api/projects'
import type { CADBoxFeature, ProjectCADDocument, UpdateCADAssemblyOccurrencePayload } from 'src/types/project'
import { cadTransformWithTranslation, type CADTranslation } from './cad-document-transforms'

const defaultTransformAutosaveDelayMS = 500

type UseCADDocumentCommandsOptions = {
  projectId: string
  autosaveDelayMS?: number
  onConflict?: (message: string) => void
  onNodeDeleted?: (nodeId: string) => void
  onTransformSynchronized?: (nodeId: string) => void
}

type TransformMutationVariables = {
  nodeId: string
  requestVersion: number
  translation: CADTranslation
}

type OccurrenceMutationVariables =
	| { action: 'duplicate'; occurrenceId: string }
	| { action: 'update'; occurrenceId: string; payload: UpdateCADAssemblyOccurrencePayload }
	| { action: 'move'; occurrenceId: string; targetIndex: number }
	| { action: 'delete'; occurrenceId: string }

function isCADDocumentConflict(error: unknown) {
  return (error as { response?: { status?: number } }).response?.status === 409
}

export function useCADDocumentCommands({
  projectId,
  autosaveDelayMS = defaultTransformAutosaveDelayMS,
  onConflict,
  onNodeDeleted,
  onTransformSynchronized,
}: UseCADDocumentCommandsOptions) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const commandQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const latestTransformRequestByNodeIdRef = useRef<Record<string, number>>({})
  const latestTranslationByNodeIdRef = useRef<Record<string, CADTranslation>>({})
  const transformAutosaveTimersRef = useRef<Record<string, number>>({})
  const [historyError, setHistoryError] = useState('')
  const [deleteError, setDeleteError] = useState('')
	const [occurrenceError, setOccurrenceError] = useState('')
  const [transformErrorsByNodeId, setTransformErrorsByNodeId] = useState<Record<string, string>>({})
  const [boxErrorsByModelId, setBoxErrorsByModelId] = useState<Record<string, string>>({})

  const documentQueryKey = useMemo(() => ['projects', projectId, 'cad-document'] as const, [projectId])
  const historyQueryKey = useMemo(() => ['projects', projectId, 'cad-document', 'history'] as const, [projectId])
  const modelsQueryKey = useMemo(() => ['projects', projectId, 'models'] as const, [projectId])

  const enqueueCommand = useCallback(<T,>(command: () => Promise<T>) => {
    const queuedCommand = commandQueueRef.current.then(command, command)
    commandQueueRef.current = queuedCommand.then(
      () => undefined,
      () => undefined,
    )
    return queuedCommand
  }, [])

  const currentDocument = useCallback(() => queryClient.getQueryData<ProjectCADDocument>(documentQueryKey), [documentQueryKey, queryClient])

  const refreshAfterConflict = useCallback(
    async (error: unknown) => {
      if (!isCADDocumentConflict(error)) {
        return false
      }
      const conflictMessage = t('project.errors.conflict')
      setHistoryError(conflictMessage)
      onConflict?.(conflictMessage)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKey }),
        queryClient.invalidateQueries({ queryKey: historyQueryKey }),
        queryClient.invalidateQueries({ queryKey: modelsQueryKey }),
      ])
      return true
    },
    [documentQueryKey, historyQueryKey, modelsQueryKey, onConflict, queryClient, t],
  )

  const updateTransformMutation = useMutation({
    mutationFn: ({ nodeId, translation }: TransformMutationVariables) =>
      enqueueCommand(async () => {
        const document = currentDocument()
        if (!document) {
          throw new Error(t('project.errors.documentNotLoaded'))
        }
				const currentOccurrence = document.assembly?.occurrences.find((occurrence) => occurrence.id === nodeId)
				const currentNode = document.nodes.find((node) => node.id === nodeId)
				const transform = cadTransformWithTranslation(currentOccurrence?.transform ?? currentNode?.transform, translation)
				const updatedDocument = currentOccurrence
					? (await updateProjectCADOccurrence(projectId, nodeId, { transform }, document.revision)).data.document
					: (await updateProjectCADNodeTransform(projectId, nodeId, transform, document.revision)).data.document
        queryClient.setQueryData(documentQueryKey, updatedDocument)
        return updatedDocument
      }),
    onSuccess: async (document, variables) => {
      if ((latestTransformRequestByNodeIdRef.current[variables.nodeId] ?? 0) > variables.requestVersion) {
        return
      }
			const latestDocument = currentDocument()
			const acceptsTarget = !latestDocument ||
				latestDocument.nodes.some((node) => node.id === variables.nodeId) ||
				latestDocument.assembly?.occurrences.some((occurrence) => occurrence.id === variables.nodeId)
			if (!acceptsTarget) {
        return
      }
      const latestTranslation = latestTranslationByNodeIdRef.current[variables.nodeId]
      if (
        latestTranslation &&
        (latestTranslation.x !== variables.translation.x || latestTranslation.y !== variables.translation.y || latestTranslation.z !== variables.translation.z)
      ) {
        return
      }
      delete latestTranslationByNodeIdRef.current[variables.nodeId]
      onTransformSynchronized?.(variables.nodeId)
      setTransformErrorsByNodeId((errors) => ({ ...errors, [variables.nodeId]: '' }))
      queryClient.setQueryData(documentQueryKey, document)
      setHistoryError('')
      await queryClient.invalidateQueries({ queryKey: historyQueryKey })
    },
    onError: async (error, variables) => {
      if ((latestTransformRequestByNodeIdRef.current[variables.nodeId] ?? 0) > variables.requestVersion) {
        return
      }
      if (await refreshAfterConflict(error)) {
        delete latestTranslationByNodeIdRef.current[variables.nodeId]
        onTransformSynchronized?.(variables.nodeId)
      } else {
        setTransformErrorsByNodeId((errors) => ({ ...errors, [variables.nodeId]: t('project.errors.invalidTransform') }))
      }
    },
  })
  const mutateTransform = updateTransformMutation.mutate

  const cancelTransformAutosave = useCallback((nodeId: string) => {
    const timer = transformAutosaveTimersRef.current[nodeId]
    if (timer !== undefined) {
      window.clearTimeout(timer)
      delete transformAutosaveTimersRef.current[nodeId]
    }
  }, [])

  const scheduleTransformAutosave = useCallback(
    (nodeId: string, translation: CADTranslation) => {
      cancelTransformAutosave(nodeId)
      latestTranslationByNodeIdRef.current[nodeId] = translation
      const requestVersion = (latestTransformRequestByNodeIdRef.current[nodeId] ?? 0) + 1
      latestTransformRequestByNodeIdRef.current[nodeId] = requestVersion
      transformAutosaveTimersRef.current[nodeId] = window.setTimeout(() => {
        delete transformAutosaveTimersRef.current[nodeId]
        mutateTransform({ nodeId, requestVersion, translation })
      }, autosaveDelayMS)
    },
    [autosaveDelayMS, cancelTransformAutosave, mutateTransform],
  )

  const deleteNodeMutation = useMutation({
    mutationFn: ({ nodeId }: { nodeId: string }) =>
      enqueueCommand(async () => {
        const document = currentDocument()
        if (!document) {
          throw new Error(t('project.errors.documentNotLoaded'))
        }
        const updatedDocument = (await deleteProjectCADNode(projectId, nodeId, document.revision)).data.document
        queryClient.setQueryData(documentQueryKey, updatedDocument)
        return updatedDocument
      }),
    onSuccess: async (document, variables) => {
      cancelTransformAutosave(variables.nodeId)
      delete latestTranslationByNodeIdRef.current[variables.nodeId]
      delete latestTransformRequestByNodeIdRef.current[variables.nodeId]
      setTransformErrorsByNodeId((errors) => {
        const nextErrors = { ...errors }
        delete nextErrors[variables.nodeId]
        return nextErrors
      })
      setDeleteError('')
      onNodeDeleted?.(variables.nodeId)
      queryClient.setQueryData(documentQueryKey, document)
      setHistoryError('')
      await queryClient.invalidateQueries({ queryKey: historyQueryKey })
    },
    onError: async (error) => {
      if (!(await refreshAfterConflict(error))) {
        setDeleteError(t('project.errors.deleteFailed'))
      }
    },
  })

  const addBoxUnionMutation = useMutation({
    mutationFn: ({ modelId, box }: { modelId: string; box: CADBoxFeature }) =>
      enqueueCommand(async () => {
        const document = currentDocument()
        if (!document) {
          throw new Error(t('project.errors.documentNotLoaded'))
        }
        const updatedDocument = (await addProjectCADModelBoxUnion(projectId, modelId, box, document.revision)).data.document
        queryClient.setQueryData(documentQueryKey, updatedDocument)
        return updatedDocument
      }),
    onSuccess: async (document, variables) => {
      setBoxErrorsByModelId((errors) => ({ ...errors, [variables.modelId]: '' }))
      queryClient.setQueryData(documentQueryKey, document)
      setHistoryError('')
      await queryClient.invalidateQueries({ queryKey: historyQueryKey })
    },
    onError: async (error, variables) => {
      if (!(await refreshAfterConflict(error))) {
        setBoxErrorsByModelId((errors) => ({ ...errors, [variables.modelId]: t('project.errors.invalidBox') }))
      }
    },
  })

	const occurrenceMutation = useMutation({
		mutationFn: (variables: OccurrenceMutationVariables) =>
			enqueueCommand(async () => {
				const document = currentDocument()
				if (!document) {
					throw new Error(t('project.errors.documentNotLoaded'))
				}
				const request = variables.action === 'duplicate'
					? duplicateProjectCADOccurrence(projectId, variables.occurrenceId, document.revision)
					: variables.action === 'update'
						? updateProjectCADOccurrence(projectId, variables.occurrenceId, variables.payload, document.revision)
						: variables.action === 'move'
							? moveProjectCADOccurrence(projectId, variables.occurrenceId, variables.targetIndex, document.revision)
							: deleteProjectCADOccurrence(projectId, variables.occurrenceId, document.revision)
				const updatedDocument = (await request).data.document
				queryClient.setQueryData(documentQueryKey, updatedDocument)
				return updatedDocument
			}),
		onSuccess: async (document) => {
			setOccurrenceError('')
			setHistoryError('')
			queryClient.setQueryData(documentQueryKey, document)
			await queryClient.invalidateQueries({ queryKey: historyQueryKey })
		},
		onError: async (error) => {
			if (!(await refreshAfterConflict(error))) {
				setOccurrenceError(t('project.errors.occurrenceFailed'))
			}
		},
	})

  const historyMutation = useMutation({
    mutationFn: (action: 'undo' | 'redo') =>
      enqueueCommand(async () => {
        const document = currentDocument()
        if (!document) {
          throw new Error(t('project.errors.documentNotLoaded'))
        }
        const request = action === 'undo' ? undoProjectCADDocument : redoProjectCADDocument
        const updatedDocument = (await request(projectId, document.revision)).data.document
        queryClient.setQueryData(documentQueryKey, updatedDocument)
        return updatedDocument
      }),
    onSuccess: async () => {
      setHistoryError('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: historyQueryKey }),
        queryClient.invalidateQueries({ queryKey: modelsQueryKey }),
      ])
    },
    onError: async (error) => {
      if (!(await refreshAfterConflict(error))) {
        setHistoryError(t('project.errors.historyFailed'))
      }
    },
  })
  const mutateBoxUnion = addBoxUnionMutation.mutate
  const mutateDeleteNode = deleteNodeMutation.mutate
  const mutateHistory = historyMutation.mutate
	const mutateOccurrence = occurrenceMutation.mutate

  useEffect(
    () => () => {
      Object.values(transformAutosaveTimersRef.current).forEach((timer) => window.clearTimeout(timer))
      transformAutosaveTimersRef.current = {}
    },
    [],
  )

  const addBoxUnion = useCallback(
    (modelId: string, box: CADBoxFeature) => mutateBoxUnion({ modelId, box }),
    [mutateBoxUnion],
  )
  const changeHistory = useCallback((action: 'undo' | 'redo') => mutateHistory(action), [mutateHistory])
  const clearDeleteError = useCallback(() => setDeleteError(''), [])
  const clearHistoryError = useCallback(() => setHistoryError(''), [])
  const deleteNode = useCallback((nodeId: string) => mutateDeleteNode({ nodeId }), [mutateDeleteNode])
	const deleteOccurrence = useCallback((occurrenceId: string) => mutateOccurrence({ action: 'delete', occurrenceId }), [mutateOccurrence])
	const duplicateOccurrence = useCallback((occurrenceId: string) => mutateOccurrence({ action: 'duplicate', occurrenceId }), [mutateOccurrence])
	const moveOccurrence = useCallback(
		(occurrenceId: string, targetIndex: number) => mutateOccurrence({ action: 'move', occurrenceId, targetIndex }),
		[mutateOccurrence],
	)
	const updateOccurrence = useCallback(
		(occurrenceId: string, payload: UpdateCADAssemblyOccurrencePayload) => mutateOccurrence({ action: 'update', occurrenceId, payload }),
		[mutateOccurrence],
	)
  const hasPendingTransform = useCallback((nodeId: string) => Boolean(latestTranslationByNodeIdRef.current[nodeId]), [])
  const setBoxValidationError = useCallback(
    (modelId: string, message: string) => setBoxErrorsByModelId((errors) => ({ ...errors, [modelId]: message })),
    [],
  )
  const setTransformValidationError = useCallback(
    (nodeId: string, message: string) => setTransformErrorsByNodeId((errors) => ({ ...errors, [nodeId]: message })),
    [],
  )

  return {
    addBoxUnion,
    boxErrorsByModelId,
    cancelTransformAutosave,
    changeHistory,
    clearDeleteError,
    clearHistoryError,
    deleteError,
    deleteNode,
		deleteOccurrence,
		duplicateOccurrence,
    historyError,
    isBoxUnionPendingFor: (modelId: string) => addBoxUnionMutation.isPending && addBoxUnionMutation.variables?.modelId === modelId,
    isDeletingNode: (nodeId: string) => deleteNodeMutation.isPending && deleteNodeMutation.variables?.nodeId === nodeId,
		isOccurrenceMutationPending: occurrenceMutation.isPending,
		isPending: updateTransformMutation.isPending || deleteNodeMutation.isPending || addBoxUnionMutation.isPending || occurrenceMutation.isPending || historyMutation.isPending,
		moveOccurrence,
		occurrenceError,
    hasPendingTransform,
    scheduleTransformAutosave,
    setBoxValidationError,
    setTransformValidationError,
    transformErrorsByNodeId,
		updateOccurrence,
  }
}
