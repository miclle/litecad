import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  addProjectCADModelBoxUnion,
  captureProjectCADSubassembly,
  createProjectCADAssemblyConstraint,
  createProjectCADAssemblyGroup,
  deleteProjectCADAssemblyConstraint,
  deleteProjectCADOccurrence,
  deleteProjectCADAssemblyGroup,
  deleteProjectCADNode,
  duplicateProjectCADOccurrence,
  instantiateProjectCADSubassembly,
  moveProjectCADOccurrence,
  redoProjectCADDocument,
  undoProjectCADDocument,
  updateProjectCADNodeTransform,
  updateProjectCADOccurrence,
  updateProjectCADAssemblyGroup,
} from 'src/api/projects'
import type { CADBoxFeature, CaptureCADSubassemblyPayload, CreateCADAssemblyConstraintPayload, InstantiateCADSubassemblyPayload, ProjectCADDocument, UpdateCADAssemblyGroupPayload, UpdateCADAssemblyOccurrencePayload } from 'src/types/project'
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
  | {
      action: 'update'
      occurrenceId: string
      payload: UpdateCADAssemblyOccurrencePayload
    }
  | { action: 'move'; occurrenceId: string; targetIndex: number }
  | { action: 'delete'; occurrenceId: string }

type OccurrenceMutationContext = {
  previousDocument?: ProjectCADDocument
}

type AssemblyGroupMutationVariables =
  | { action: 'create'; name: string; parentGroupId: string }
  | {
      action: 'update'
      groupId: string
      payload: UpdateCADAssemblyGroupPayload
    }
  | { action: 'delete'; groupId: string }

type AssemblyConstraintMutationVariables =
  | { action: 'create'; payload: CreateCADAssemblyConstraintPayload }
  | { action: 'delete'; constraintId: string }

type SubassemblyMutationVariables =
  | { action: 'capture'; payload: CaptureCADSubassemblyPayload }
  | { action: 'instantiate'; definitionId: string; payload: InstantiateCADSubassemblyPayload }

function isCADDocumentConflict(error: unknown) {
  return (error as { response?: { status?: number } }).response?.status === 409
}

function optimisticallyMoveOccurrence(document: ProjectCADDocument, occurrenceId: string, targetIndex: number): ProjectCADDocument {
  const occurrences = document.assembly?.occurrences
  const sourceIndex = occurrences?.findIndex((occurrence) => occurrence.id === occurrenceId) ?? -1
  if (!document.assembly || !occurrences || sourceIndex < 0 || targetIndex < 0 || targetIndex >= occurrences.length || sourceIndex === targetIndex) {
    return document
  }
  const nextOccurrences = [...occurrences]
  const [occurrence] = nextOccurrences.splice(sourceIndex, 1)
  nextOccurrences.splice(targetIndex, 0, occurrence)
  return {
    ...document,
    assembly: {
      ...document.assembly,
      occurrences: nextOccurrences,
    },
  }
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
  const [constraintError, setConstraintError] = useState('')
  const [subassemblyError, setSubassemblyError] = useState('')
  const [transformErrorsByNodeId, setTransformErrorsByNodeId] = useState<Record<string, string>>({})
  const [boxErrorsByModelId, setBoxErrorsByModelId] = useState<Record<string, string>>({})

  const documentQueryKey = useMemo(() => ['projects', projectId, 'cad-document'] as const, [projectId])
  const historyQueryKey = useMemo(() => ['projects', projectId, 'cad-document', 'history'] as const, [projectId])
  const modelsQueryKey = useMemo(() => ['projects', projectId, 'models'] as const, [projectId])

  const enqueueCommand = useCallback(<T>(command: () => Promise<T>) => {
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
      const acceptsTarget =
        !latestDocument ||
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
      setTransformErrorsByNodeId((errors) => ({
        ...errors,
        [variables.nodeId]: '',
      }))
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
        setTransformErrorsByNodeId((errors) => ({
          ...errors,
          [variables.nodeId]: t('project.errors.invalidTransform'),
        }))
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
      setBoxErrorsByModelId((errors) => ({
        ...errors,
        [variables.modelId]: '',
      }))
      queryClient.setQueryData(documentQueryKey, document)
      setHistoryError('')
      await queryClient.invalidateQueries({ queryKey: historyQueryKey })
    },
    onError: async (error, variables) => {
      if (!(await refreshAfterConflict(error))) {
        setBoxErrorsByModelId((errors) => ({
          ...errors,
          [variables.modelId]: t('project.errors.invalidBox'),
        }))
      }
    },
  })

  const occurrenceMutation = useMutation<ProjectCADDocument, unknown, OccurrenceMutationVariables, OccurrenceMutationContext>({
    onMutate: async (variables) => {
      if (variables.action !== 'move') {
        return {}
      }
      const previousDocument = currentDocument()
      const cancelPendingDocumentFetch = queryClient.cancelQueries({ queryKey: documentQueryKey })
      if (previousDocument) {
        queryClient.setQueryData(documentQueryKey, optimisticallyMoveOccurrence(previousDocument, variables.occurrenceId, variables.targetIndex))
      }
      await cancelPendingDocumentFetch
      return { previousDocument }
    },
    mutationFn: (variables: OccurrenceMutationVariables) =>
      enqueueCommand(async () => {
        const document = currentDocument()
        if (!document) {
          throw new Error(t('project.errors.documentNotLoaded'))
        }
        const request =
          variables.action === 'duplicate'
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
    onError: async (error, _variables, context) => {
      if (context?.previousDocument) {
        queryClient.setQueryData(documentQueryKey, context.previousDocument)
      }
      if (!(await refreshAfterConflict(error))) {
        setOccurrenceError(t('project.errors.occurrenceFailed'))
      }
    },
  })

  const assemblyGroupMutation = useMutation({
    mutationFn: (variables: AssemblyGroupMutationVariables) =>
      enqueueCommand(async () => {
        const document = currentDocument()
        if (!document) {
          throw new Error(t('project.errors.documentNotLoaded'))
        }
        const request =
          variables.action === 'create'
            ? createProjectCADAssemblyGroup(
                projectId,
                {
                  name: variables.name,
                  parent_group_id: variables.parentGroupId,
                },
                document.revision,
              )
            : variables.action === 'update'
              ? updateProjectCADAssemblyGroup(projectId, variables.groupId, variables.payload, document.revision)
              : deleteProjectCADAssemblyGroup(projectId, variables.groupId, document.revision)
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
        setOccurrenceError(t('project.errors.assemblyGroupFailed'))
      }
    },
  })

  const assemblyConstraintMutation = useMutation({
    mutationFn: (variables: AssemblyConstraintMutationVariables) =>
      enqueueCommand(async () => {
        const document = currentDocument()
        if (!document) {
          throw new Error(t('project.errors.documentNotLoaded'))
        }
        const request =
          variables.action === 'create'
            ? createProjectCADAssemblyConstraint(projectId, variables.payload, document.revision)
            : deleteProjectCADAssemblyConstraint(projectId, variables.constraintId, document.revision)
        const updatedDocument = (await request).data.document
        queryClient.setQueryData(documentQueryKey, updatedDocument)
        return updatedDocument
      }),
    onSuccess: async (document) => {
      setConstraintError('')
      setHistoryError('')
      queryClient.setQueryData(documentQueryKey, document)
      await queryClient.invalidateQueries({ queryKey: historyQueryKey })
    },
    onError: async (error) => {
      if (!(await refreshAfterConflict(error))) {
        setConstraintError(t('project.errors.assemblyConstraintFailed'))
      }
    },
  })

  const subassemblyMutation = useMutation({
    mutationFn: (variables: SubassemblyMutationVariables) =>
      enqueueCommand(async () => {
        const document = currentDocument()
        if (!document) {
          throw new Error(t('project.errors.documentNotLoaded'))
        }
        const request =
          variables.action === 'capture'
            ? captureProjectCADSubassembly(projectId, variables.payload, document.revision)
            : instantiateProjectCADSubassembly(projectId, variables.definitionId, variables.payload, document.revision)
        const updatedDocument = (await request).data.document
        queryClient.setQueryData(documentQueryKey, updatedDocument)
        return updatedDocument
      }),
    onSuccess: async (document) => {
      setSubassemblyError('')
      setHistoryError('')
      queryClient.setQueryData(documentQueryKey, document)
      await queryClient.invalidateQueries({ queryKey: historyQueryKey })
    },
    onError: async (error) => {
      if (!(await refreshAfterConflict(error))) {
        setSubassemblyError(t('project.errors.subassemblyFailed'))
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
      await Promise.all([queryClient.invalidateQueries({ queryKey: historyQueryKey }), queryClient.invalidateQueries({ queryKey: modelsQueryKey })])
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
  const mutateAssemblyGroup = assemblyGroupMutation.mutate
  const mutateAssemblyConstraint = assemblyConstraintMutation.mutate
  const mutateSubassembly = subassemblyMutation.mutate
  const mutateSubassemblyAsync = subassemblyMutation.mutateAsync

  useEffect(
    () => () => {
      Object.values(transformAutosaveTimersRef.current).forEach((timer) => window.clearTimeout(timer))
      transformAutosaveTimersRef.current = {}
    },
    [],
  )

  const addBoxUnion = useCallback((modelId: string, box: CADBoxFeature) => mutateBoxUnion({ modelId, box }), [mutateBoxUnion])
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
  const createAssemblyGroup = useCallback(
    (name: string, parentGroupId: string) => mutateAssemblyGroup({ action: 'create', name, parentGroupId }),
    [mutateAssemblyGroup],
  )
  const createAssemblyConstraint = useCallback(
    (payload: CreateCADAssemblyConstraintPayload) => mutateAssemblyConstraint({ action: 'create', payload }),
    [mutateAssemblyConstraint],
  )
  const deleteAssemblyConstraint = useCallback(
    (constraintId: string) => mutateAssemblyConstraint({ action: 'delete', constraintId }),
    [mutateAssemblyConstraint],
  )
  const captureSubassembly = useCallback(
    (payload: CaptureCADSubassemblyPayload) => mutateSubassembly({ action: 'capture', payload }),
    [mutateSubassembly],
  )
  const instantiateSubassembly = useCallback(
    async (definitionId: string, payload: InstantiateCADSubassemblyPayload) => {
      await mutateSubassemblyAsync({ action: 'instantiate', definitionId, payload })
    },
    [mutateSubassemblyAsync],
  )
  const deleteAssemblyGroup = useCallback((groupId: string) => mutateAssemblyGroup({ action: 'delete', groupId }), [mutateAssemblyGroup])
  const updateAssemblyGroup = useCallback(
    (groupId: string, payload: UpdateCADAssemblyGroupPayload) => mutateAssemblyGroup({ action: 'update', groupId, payload }),
    [mutateAssemblyGroup],
  )
  const hasPendingTransform = useCallback((nodeId: string) => Boolean(latestTranslationByNodeIdRef.current[nodeId]), [])
  const setBoxValidationError = useCallback((modelId: string, message: string) => setBoxErrorsByModelId((errors) => ({ ...errors, [modelId]: message })), [])
  const setTransformValidationError = useCallback(
    (nodeId: string, message: string) =>
      setTransformErrorsByNodeId((errors) => ({
        ...errors,
        [nodeId]: message,
      })),
    [],
  )

  return {
    addBoxUnion,
    boxErrorsByModelId,
    cancelTransformAutosave,
    changeHistory,
    clearDeleteError,
    clearHistoryError,
    createAssemblyGroup,
    createAssemblyConstraint,
    captureSubassembly,
    constraintError,
    deleteError,
    deleteNode,
    deleteOccurrence,
    deleteAssemblyGroup,
    deleteAssemblyConstraint,
    duplicateOccurrence,
    historyError,
    isBoxUnionPendingFor: (modelId: string) => addBoxUnionMutation.isPending && addBoxUnionMutation.variables?.modelId === modelId,
    isDeletingNode: (nodeId: string) => deleteNodeMutation.isPending && deleteNodeMutation.variables?.nodeId === nodeId,
    isOccurrenceMutationPending:
      occurrenceMutation.isPending || assemblyGroupMutation.isPending || assemblyConstraintMutation.isPending || subassemblyMutation.isPending,
    isAssemblyConstraintMutationPending: assemblyConstraintMutation.isPending,
    isSubassemblyMutationPending: subassemblyMutation.isPending,
    isPending:
      updateTransformMutation.isPending ||
      deleteNodeMutation.isPending ||
      addBoxUnionMutation.isPending ||
      occurrenceMutation.isPending ||
      assemblyGroupMutation.isPending ||
      assemblyConstraintMutation.isPending ||
      subassemblyMutation.isPending ||
      historyMutation.isPending,
    instantiateSubassembly,
    moveOccurrence,
    occurrenceError,
    subassemblyError,
    hasPendingTransform,
    scheduleTransformAutosave,
    setBoxValidationError,
    setTransformValidationError,
    transformErrorsByNodeId,
    updateOccurrence,
    updateAssemblyGroup,
  }
}
