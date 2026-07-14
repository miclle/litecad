import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  createProjectAgentConversation,
  fetchProjectAgentConversationMessages,
  fetchProjectAgentConversations,
  fetchProjectParametricArtifacts,
  runProjectAgentParametric,
  sendProjectAgentConversationMessage,
} from 'src/api/projects'
import type { ProjectModel, ProjectParametricArtifact } from 'src/types/project'
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
  const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message
  if (status === 503) {
    return t('project.assistant.notConfigured')
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
    return 'Assistant could not answer right now. Check the AI provider configuration and try again.'
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
        ? messagesQuery.data.map((message) => ({ id: message.id, role: message.role, body: displayAiChatBody(message.body, t) }))
        : initialMessages,
    [initialMessages, messagesQuery.data, t],
  )
  const messages = useMemo(() => [...persistedMessages, ...localMessages], [localMessages, persistedMessages])

  const selectArtifact = (artifact: ProjectParametricArtifact) => {
    setParametricRunError('')
    setParametricProgress(undefined)
    setParametricRunAttempt(0)
    setRetryParametricPrompt('')
    onArtifactSelected?.(artifact)
  }

  const messageMutation = useMutation({
    mutationFn: async (messageBody: string) => {
      const response = await sendProjectAgentConversationMessage(projectId, activeConversationID, {
        messages: [{ role: 'user', body: messageBody }],
        ...(activeModel?.id ? { active_model_id: activeModel.id } : {}),
      })
      return response.data
    },
    onSuccess: async ({ artifact, message }) => {
      setLocalMessages((currentMessages) => [
        ...currentMessages,
        { id: `local-assistant-${message.id || Date.now()}`, role: 'assistant', body: message.body },
      ])
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
    onError: (error) => {
      setLocalMessages((currentMessages) => [
        ...currentMessages,
        { id: `assistant-error-${Date.now()}`, role: 'assistant', body: projectAssistantErrorMessage(error, t) },
      ])
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
    setLocalMessages((currentMessages) => [
      ...currentMessages,
      { id: `local-user-${Date.now()}`, role: 'user', body: messageBody },
    ])
    messageMutation.mutate(messageBody)
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
    setSelectedConversationID(conversationID)
    setDraft('')
    setLocalMessages([])
    setParametricRunError('')
    setParametricProgress(undefined)
    setParametricRunAttempt(0)
    setRetryParametricPrompt('')
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

function projectAssistantModelDisplayName(model: ProjectModel) {
  return model.metadata.product_names?.find((name) => name.trim() !== '')?.trim() || model.original_filename
}
