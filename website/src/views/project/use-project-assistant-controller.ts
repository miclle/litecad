import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import {
  createProjectAgentConversation,
  fetchProjectAgentConversationMessages,
  fetchProjectAgentConversations,
  fetchProjectParametricArtifacts,
  runProjectAgentParametric,
  sendProjectAgentConversationMessage,
} from 'src/api/projects'
import type { ProjectParametricArtifact } from 'src/types/project'
import { displayAiChatBody, generatedArtifactTitleFromAIChatBody } from './project-agent-tool-message'
import type { AiChatMessage } from './project-assistant-panel'
import { formatParametricRunSummary } from './project-parametric-run-telemetry'

const initialMessages: AiChatMessage[] = [
  {
    id: 'assistant-initial',
    role: 'assistant',
    body: 'I can stay beside the model while you inspect sources, metadata, and design notes.',
  },
]

type UseProjectAssistantControllerOptions = {
  enabled: boolean
  onArtifactSelected?: (artifact: ProjectParametricArtifact) => void
  projectId: string
}

export function projectAssistantErrorMessage(error: unknown) {
  const status = (error as { response?: { status?: number } }).response?.status
  const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message
  if (status === 503) {
    return 'Assistant is not configured yet. Add the server-side AI provider settings, then try again.'
  }
  if (message) {
    return message
  }
  return 'Assistant could not answer right now. Check the AI provider configuration and try again.'
}

export function useProjectAssistantController({
  enabled,
  onArtifactSelected,
  projectId,
}: UseProjectAssistantControllerOptions) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [localMessages, setLocalMessages] = useState<AiChatMessage[]>([])
  const [selectedConversationID, setSelectedConversationID] = useState('')
  const [parametricRunError, setParametricRunError] = useState('')
  const [retryParametricPrompt, setRetryParametricPrompt] = useState('')

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
  const persistedMessages = useMemo<AiChatMessage[]>(
    () =>
      messagesQuery.data && messagesQuery.data.length > 0
        ? messagesQuery.data.map((message) => ({ id: message.id, role: message.role, body: displayAiChatBody(message.body) }))
        : initialMessages,
    [messagesQuery.data],
  )
  const messages = useMemo(() => [...persistedMessages, ...localMessages], [localMessages, persistedMessages])

  const selectArtifact = (artifact: ProjectParametricArtifact) => {
    setParametricRunError('')
    setRetryParametricPrompt('')
    onArtifactSelected?.(artifact)
  }

  const messageMutation = useMutation({
    mutationFn: async (messageBody: string) => {
      const response = await sendProjectAgentConversationMessage(projectId, activeConversationID, {
        messages: [{ role: 'user', body: messageBody }],
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
        { id: `assistant-error-${Date.now()}`, role: 'assistant', body: projectAssistantErrorMessage(error) },
      ])
    },
  })

  const parametricMutation = useMutation({
    mutationFn: async (messageBody: string) => {
      const response = await runProjectAgentParametric(projectId, activeConversationID, { message: messageBody })
      return response.data
    },
    onSuccess: async ({ artifact, message, telemetry }) => {
      selectArtifact(artifact)
      setLocalMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `local-assistant-parametric-${message.id || Date.now()}`,
          role: 'assistant',
          body: formatParametricRunSummary(artifact.title, telemetry),
        },
      ])
      await queryClient.invalidateQueries({ queryKey: ['project-agent-conversations', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['project-agent-messages', projectId, message.conversation_id] })
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'parametric-artifacts'] })
      setLocalMessages([])
    },
    onError: (error) => {
      const errorMessage = projectAssistantErrorMessage(error)
      setParametricRunError(errorMessage)
      setLocalMessages((currentMessages) => [
        ...currentMessages,
        { id: `assistant-parametric-error-${Date.now()}`, role: 'assistant', body: errorMessage },
      ])
    },
  })

  const createConversationMutation = useMutation({
    mutationFn: async () => (await createProjectAgentConversation(projectId, { title: 'New chat' })).data.conversation,
    onSuccess: async (conversation) => {
      setSelectedConversationID(conversation.id)
      setDraft('')
      setLocalMessages([])
      setParametricRunError('')
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
    setParametricRunError('')
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
    setRetryParametricPrompt('')
  }

  return {
    activeConversationID,
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
