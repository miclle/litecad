import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'

import {
  createProjectAgentConversation,
  fetchProjectAgentConversationMessages,
  fetchProjectAgentConversations,
  fetchProjectParametricArtifacts,
  runProjectAgentParametric,
} from 'src/api/projects'
import { streamProjectAgentConversationMessage } from 'src/api/project-agent-stream'
import type { ProjectAgentStreamEvent, ProjectModel, ProjectParametricArtifact } from 'src/types/project'
import { displayAiChatBody, generatedArtifactTitleFromAIChatBody } from './project-agent-tool-message'
import type { AiChatMessage, ParametricGenerationProgress } from './project-assistant-panel'
import { formatParametricRunSummary } from './project-parametric-run-telemetry'

type UseProjectAssistantControllerOptions = {
  activeModel?: ProjectModel
  enabled: boolean
  onArtifactSelected?: (artifact: ProjectParametricArtifact) => void
  projectId: string
}

type AssistantTranslator = (key: string) => string

export function projectAssistantErrorMessage(error: unknown, t: AssistantTranslator = defaultAssistantTranslator) {
  const status = (error as { response?: { status?: number } }).response?.status
  const data = (error as { response?: { data?: unknown } }).response?.data
  const message = typeof data === 'string' ? data : (data as { message?: string } | undefined)?.message
  if (status === 503) {
    return t('project.assistant.notConfigured')
  }
  if (status === 502) {
    return t('project.assistant.providerRequestFailed')
  }
  if (status === 422) {
    return t('project.assistant.providerInvalidOutput')
  }
  if (message) {
    return message
  }
  return t('project.assistant.answerFailed')
}

function defaultAssistantTranslator(key: string) {
  if (key === 'project.assistant.notConfigured') {
    return 'Assistant is not configured yet. Add the server-side AI provider settings, then try again.'
  }
  if (key === 'project.assistant.answerFailed') {
    return 'Assistant could not answer right now. Retry the request or check the server logs.'
  }
  if (key === 'project.assistant.providerRequestFailed') {
    return 'The AI provider request failed. Retry generation; if it keeps failing, check model compatibility and timeout settings.'
  }
  if (key === 'project.assistant.providerInvalidOutput') {
    return 'The AI provider returned a model draft LiteCAD could not validate. Retry generation with a more specific prompt.'
  }
  return key
}

export function useProjectAssistantController({
  activeModel,
  enabled,
  onArtifactSelected,
  projectId,
}: UseProjectAssistantControllerOptions) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [localMessages, setLocalMessages] = useState<AiChatMessage[]>([])
  const [selectedConversationID, setSelectedConversationID] = useState('')
  const [parametricRunError, setParametricRunError] = useState('')
  const [parametricProgress, setParametricProgress] = useState<ParametricGenerationProgress | undefined>(undefined)
  const [parametricRunAttempt, setParametricRunAttempt] = useState(0)
  const [retryParametricPrompt, setRetryParametricPrompt] = useState('')
  const [generatedArtifactRevisionTargetModelID, setGeneratedArtifactRevisionTargetModelID] = useState('')
  const activeMessageStreamRef = useRef<{ controller: AbortController; requestID: string } | null>(null)
  const activeModelName = activeModel ? projectAssistantModelDisplayName(activeModel) : ''

  const conversationsQuery = useQuery({
    queryKey: ['project-agent-conversations', projectId],
    queryFn: async () => (await fetchProjectAgentConversations(projectId)).data.conversations,
    enabled: projectId !== '' && enabled,
  })
  const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data])
  const activeConversationID = conversations.some((conversation) => conversation.id === selectedConversationID)
    ? selectedConversationID
    : conversations[0]?.id || ''
  const messagesQuery = useQuery({
    queryKey: ['project-agent-messages', projectId, activeConversationID],
    queryFn: async () => (await fetchProjectAgentConversationMessages(projectId, activeConversationID)).data.messages,
    enabled: projectId !== '' && enabled && activeConversationID !== '',
  })
  const initialMessages = useMemo<AiChatMessage[]>(
    () => [
      {
        id: 'assistant-initial',
        role: 'assistant',
        body: t('project.assistant.initialMessage'),
      },
    ],
    [t],
  )
  const persistedMessages = useMemo<AiChatMessage[]>(
    () =>
      messagesQuery.data && messagesQuery.data.length > 0
        ? messagesQuery.data.map((message) => ({
            id: message.id,
            role: message.role,
            body: displayAiChatBody(message.body, t),
            clientRequestID: message.client_request_id,
          }))
        : initialMessages,
    [initialMessages, messagesQuery.data, t],
  )
  const messages = useMemo(() => {
    const persistedClientRequestIDs = new Set(
      persistedMessages
        .map((message) => message.clientRequestID)
        .filter((requestID): requestID is string => requestID !== undefined),
    )
    return [
      ...persistedMessages,
      ...localMessages.filter(
        (message) => !message.clientRequestID || !persistedClientRequestIDs.has(message.clientRequestID),
      ),
    ]
  }, [localMessages, persistedMessages])

  useEffect(
    () => () => {
      activeMessageStreamRef.current?.controller.abort()
      activeMessageStreamRef.current = null
    },
    [activeConversationID, projectId],
  )

  const selectArtifact = (artifact: ProjectParametricArtifact) => {
    setParametricRunError('')
    setParametricProgress(undefined)
    setParametricRunAttempt(0)
    setRetryParametricPrompt('')
    setGeneratedArtifactRevisionTargetModelID(revisionTargetModelIDForArtifact(activeModel, artifact))
    onArtifactSelected?.(artifact)
  }

  const messageMutation = useMutation({
    mutationFn: async ({
      conversationID,
      messageBody,
      requestID,
      signal,
      streamMessageID,
    }: {
      conversationID: string
      messageBody: string
      requestID: string
      signal: AbortSignal
      streamMessageID: string
    }) =>
      streamProjectAgentConversationMessage(projectId, conversationID, {
        client_request_id: requestID,
        messages: [{ role: 'user', body: messageBody }],
        ...(activeModel?.id ? { active_model_id: activeModel.id } : {}),
      }, (event) => {
        if (activeMessageStreamRef.current?.requestID === requestID) {
          updateProjectAgentStreamMessage(streamMessageID, event, setLocalMessages)
        }
      }, signal),
    onSuccess: async ({ artifact, message }, { requestID, streamMessageID }) => {
      if (activeMessageStreamRef.current?.requestID !== requestID) {
        return
      }
      activeMessageStreamRef.current = null
      setLocalMessages((currentMessages) =>
        currentMessages.map((candidate) =>
          candidate.id === streamMessageID
            ? {
                ...candidate,
                body: displayAiChatBody(message.body, t),
                stream: candidate.stream ? { ...candidate.stream, stage: 'complete', state: 'active' } : undefined,
              }
            : candidate,
        ),
      )
      await queryClient.invalidateQueries({ queryKey: ['project-agent-conversations', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['project-agent-messages', projectId, message.conversation_id] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'parametric-artifacts'] })
      if (artifact) {
        selectArtifact(artifact)
      } else {
        const generatedTitle = generatedArtifactTitleFromAIChatBody(message.body)
        if (generatedTitle) {
          const artifacts = (await fetchProjectParametricArtifacts(projectId)).data.artifacts
          const generatedArtifact =
            artifacts.find((candidate) => candidate.message_id === message.id) ??
            artifacts.find(
              (candidate) => candidate.title === generatedTitle && candidate.conversation_id === message.conversation_id,
            )
          if (generatedArtifact) {
            selectArtifact(generatedArtifact)
          }
        }
      }
      setLocalMessages([])
    },
    onError: async (error, { conversationID, requestID, streamMessageID }) => {
      if (activeMessageStreamRef.current?.requestID !== requestID) {
        return
      }
      activeMessageStreamRef.current = null
      if (isAbortError(error)) {
        return
      }

      try {
        const refreshedMessages = (await fetchProjectAgentConversationMessages(projectId, conversationID)).data.messages
        queryClient.setQueryData(['project-agent-messages', projectId, conversationID], refreshedMessages)
        const recoveredReply = refreshedMessages.find(
          (message) => message.role === 'assistant' && message.client_request_id === requestID,
        )
        if (recoveredReply) {
          setLocalMessages([])
          await queryClient.invalidateQueries({ queryKey: ['project-agent-conversations', projectId] })
          await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'parametric-artifacts'] })
          try {
            const artifacts = (await fetchProjectParametricArtifacts(projectId)).data.artifacts
            const recoveredArtifact = artifacts.find((artifact) => artifact.message_id === recoveredReply.id)
            if (recoveredArtifact) {
              selectArtifact(recoveredArtifact)
            }
          } catch {
            // The recovered message is authoritative even when artifact refresh fails.
          }
          return
        }
      } catch {
        // Preserve the partial response below when reconciliation is unavailable.
      }

      const errorMessage = projectAssistantErrorMessage(error, t)
      setLocalMessages((currentMessages) =>
        currentMessages.map((candidate) =>
          candidate.id === streamMessageID
            ? {
                ...candidate,
                stream: {
                  error: errorMessage,
                  reasoning: candidate.stream?.reasoning ?? '',
                  stage: candidate.stream?.stage ?? 'connecting',
                  state: 'error',
                },
              }
            : candidate,
        ),
      )
    },
  })

  const parametricMutation = useMutation({
    mutationFn: async (messageBody: string) => {
      const response = await runProjectAgentParametric(projectId, activeConversationID, {
        message: messageBody,
        ...(activeModel?.id ? { active_model_id: activeModel.id } : {}),
      })
      return response.data
    },
    onSuccess: async ({ artifact, message, telemetry }) => {
      selectArtifact(artifact)
      setLocalMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `local-assistant-parametric-${message.id || Date.now()}`,
          role: 'assistant',
          body: formatParametricRunSummary(artifact.title, telemetry, t, {
            activeModelName,
          }),
        },
      ])
      await queryClient.invalidateQueries({ queryKey: ['project-agent-conversations', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['project-agent-messages', projectId, message.conversation_id] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'parametric-artifacts'] })
      setLocalMessages([])
    },
    onError: (error) => {
      const errorMessage = projectAssistantErrorMessage(error, t)
      setParametricRunError(errorMessage)
      setParametricProgress(undefined)
      setLocalMessages((currentMessages) => [
        ...currentMessages,
        { id: `assistant-parametric-error-${Date.now()}`, role: 'assistant', body: errorMessage },
      ])
    },
  })

  const createConversationMutation = useMutation({
    mutationFn: async () => (await createProjectAgentConversation(projectId, { title: t('project.assistant.newChat') })).data.conversation,
    onSuccess: async (conversation) => {
      setSelectedConversationID(conversation.id)
      setDraft('')
      setLocalMessages([])
      setParametricRunError('')
      setParametricProgress(undefined)
      setParametricRunAttempt(0)
      setRetryParametricPrompt('')
      setGeneratedArtifactRevisionTargetModelID('')
      queryClient.setQueryData(
        ['project-agent-conversations', projectId],
        (current: typeof conversations | undefined) => [conversation, ...(current ?? [])],
      )
      await queryClient.invalidateQueries({ queryKey: ['project-agent-conversations', projectId] })
    },
  })

  const submitMessage = () => {
    const messageBody = draft.trim()
    if (!messageBody || messageMutation.isPending || parametricMutation.isPending || !activeConversationID) {
      return
    }
    const requestID = createProjectAgentClientRequestID()
    const streamMessageID = requestID
    const requestIdentity = streamMessageID
    const streamController = new AbortController()
    activeMessageStreamRef.current?.controller.abort()
    activeMessageStreamRef.current = { controller: streamController, requestID: requestIdentity }
    setLocalMessages((currentMessages) => [
      ...currentMessages,
      { id: `local-user-${requestID}`, role: 'user', body: messageBody, clientRequestID: requestIdentity },
      {
        id: streamMessageID,
        role: 'assistant',
        body: '',
        clientRequestID: requestIdentity,
        stream: {
          reasoning: '',
          stage: 'connecting',
          state: 'active',
        },
      },
    ])
    messageMutation.mutate({
      conversationID: activeConversationID,
      messageBody,
      requestID: requestIdentity,
      signal: streamController.signal,
      streamMessageID,
    })
    setDraft('')
  }

  const runParametricGeneration = (messageBody: string) => {
    const isRetry =
      parametricRunError !== '' && retryParametricPrompt.trim() === messageBody
    const nextAttempt = isRetry ? parametricRunAttempt + 1 : 1
    setParametricRunError('')
    setParametricRunAttempt(nextAttempt)
    setParametricProgress({
      attempt: nextAttempt,
      prompt: messageBody,
      ...(activeModelName ? { activeModelName } : {}),
    })
    setRetryParametricPrompt(messageBody)
    setLocalMessages((currentMessages) => [
      ...currentMessages,
      { id: `local-user-parametric-${Date.now()}`, role: 'user', body: messageBody },
    ])
    parametricMutation.mutate(messageBody)
  }

  const generateParametricArtifact = () => {
    const messageBody = draft.trim()
    if (!messageBody || parametricMutation.isPending || !activeConversationID) {
      return
    }
    runParametricGeneration(messageBody)
    setDraft('')
  }

  const retryParametricGeneration = () => {
    const messageBody = retryParametricPrompt.trim()
    if (
      !messageBody ||
      messageMutation.isPending ||
      parametricMutation.isPending ||
      createConversationMutation.isPending ||
      !activeConversationID
    ) {
      return
    }
    runParametricGeneration(messageBody)
  }

  const selectConversation = (conversationID: string) => {
    activeMessageStreamRef.current?.controller.abort()
    activeMessageStreamRef.current = null
    setSelectedConversationID(conversationID)
    setDraft('')
    setLocalMessages([])
    setParametricRunError('')
    setParametricProgress(undefined)
    setParametricRunAttempt(0)
    setRetryParametricPrompt('')
    setGeneratedArtifactRevisionTargetModelID('')
  }

  return {
    activeConversationID,
    activeModelName,
    conversations,
    createConversation: () => {
      if (!createConversationMutation.isPending) {
        createConversationMutation.mutate()
      }
    },
    draft,
    generateParametricArtifact,
    generatedArtifactRevisionTargetModelID,
    isPending: messageMutation.isPending || parametricMutation.isPending || createConversationMutation.isPending,
    messages,
    parametricProgress,
    parametricRunError,
    pendingKind: parametricMutation.isPending
      ? ('parametric' as const)
      : createConversationMutation.isPending
        ? ('conversation' as const)
        : messageMutation.isPending
          ? ('message' as const)
          : ('idle' as const),
    retryParametricGeneration,
    retryParametricPrompt,
    selectConversation,
    setDraft,
    setParametricRunError,
    submitMessage,
  }
}

function isAbortError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

function createProjectAgentClientRequestID() {
  const randomID = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `local-assistant-stream-${Date.now()}-${randomID}`
}

function updateProjectAgentStreamMessage(
  streamMessageID: string,
  event: ProjectAgentStreamEvent,
  setLocalMessages: Dispatch<SetStateAction<AiChatMessage[]>>,
) {
  if (event.type === 'result' || event.type === 'error') {
    return
  }
  setLocalMessages((currentMessages) =>
    currentMessages.map((candidate) => {
      if (candidate.id !== streamMessageID || !candidate.stream) {
        return candidate
      }
      if (event.type === 'status') {
        return { ...candidate, stream: { ...candidate.stream, stage: event.stage } }
      }
      if (event.type === 'reasoning') {
        return {
          ...candidate,
          stream: { ...candidate.stream, reasoning: candidate.stream.reasoning + event.delta },
        }
      }
      return { ...candidate, body: candidate.body + event.delta }
    }),
  )
}

function revisionTargetModelIDForArtifact(model: ProjectModel | undefined, artifact: ProjectParametricArtifact) {
  if (model?.id && model.format === 'lcad' && artifact.source_kind === 'litecad-feature-dsl') {
    return model.id
  }
  return ''
}

function projectAssistantModelDisplayName(model: ProjectModel) {
  return model.metadata.product_names?.find((name) => name.trim() !== '')?.trim() || model.original_filename
}
