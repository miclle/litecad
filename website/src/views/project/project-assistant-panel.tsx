import { AlertTriangle, BotMessageSquare, Box, CheckCircle2, Clock3, Plus, RefreshCw, Send, X } from 'lucide-react'
import { useEffect, useRef, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { ProjectAgentStreamStage } from '@/types/project'
import { AgentMarkdown } from './agent-markdown'
import { shouldSubmitAgentInputFromKey } from './agent-input'

export type AiChatMessage = {
  id: string
  role: 'assistant' | 'user'
  body: string
  clientRequestID?: string
  stream?: {
    error?: string
    reasoning: string
    stage: ProjectAgentStreamStage
    state: 'active' | 'error'
  }
}

export type AssistantConversationSummary = {
  id: string
  title: string
  updated_at: string
}

export type ParametricGenerationProgress = {
  activeModelName?: string
  attempt: number
  prompt: string
}

type ProjectAssistantPanelProps = {
  activeConversationId?: string
  activeModelName?: string
  conversations: AssistantConversationSummary[]
  draft: string
  isPending: boolean
  maxWidth: number
  messages: AiChatMessage[]
  onClose: () => void
  onCreateConversation: () => void
  onDraftChange: (draft: string) => void
  onGenerateParametric: () => void
  onResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onRetryParametric?: () => void
  onSelectConversation: (conversationId: string) => void
  onSubmit: () => void
  open: boolean
  parametricProgress?: ParametricGenerationProgress
  parametricRunError?: string
  pendingKind?: 'idle' | 'message' | 'parametric' | 'conversation'
  retryParametricPrompt?: string
  sourceCount: number
  width: number
}

const assistantPanelMinWidth = 340
const parametricProgressStepKeys = [
  'project.assistant.progress.steps.request',
  'project.assistant.progress.steps.provider',
  'project.assistant.progress.steps.validation',
  'project.assistant.progress.steps.draft',
] as const

function assistantStatusLabel({
  hasActiveConversation,
  isPending,
  pendingKind,
  t,
}: {
  hasActiveConversation: boolean
  isPending: boolean
  pendingKind: ProjectAssistantPanelProps['pendingKind']
  t: (key: string) => string
}) {
  if (isPending && pendingKind === 'parametric') {
    return t('project.assistant.status.generatingModel')
  }
  if (isPending && pendingKind === 'conversation') {
    return t('project.assistant.status.creatingChat')
  }
  if (isPending) {
    return t('project.assistant.status.thinking')
  }
  return hasActiveConversation ? t('project.assistant.status.projectContext') : t('project.assistant.status.newChatRequired')
}

export function ProjectAssistantPanel({
  activeConversationId = '',
  activeModelName = '',
  conversations,
  draft,
  isPending,
  maxWidth,
  messages,
  onClose,
  onCreateConversation,
  onDraftChange,
  onGenerateParametric,
  onResizePointerDown,
  onRetryParametric,
  onSelectConversation,
  onSubmit,
  open,
  parametricProgress,
  parametricRunError = '',
  pendingKind = 'idle',
  retryParametricPrompt = '',
  sourceCount,
  width,
}: ProjectAssistantPanelProps) {
  const { t } = useTranslation()
  const hasActiveConversation = activeConversationId !== ''
  const canSubmit = draft.trim() !== '' && !isPending && hasActiveConversation
  const canGenerate = canSubmit
  const canRetryParametric = retryParametricPrompt.trim() !== '' && !isPending && hasActiveConversation && !!onRetryParametric
  const statusLabel = assistantStatusLabel({ hasActiveConversation, isPending, pendingKind, t })
  const progressPrompt = parametricProgress?.prompt.trim() || retryParametricPrompt.trim()
  const revisionModelName = parametricProgress?.activeModelName?.trim() || activeModelName.trim()
  const messageListRef = useRef<HTMLDivElement>(null)
  const followLatestMessageRef = useRef(true)
  const lastMessage = messages.at(-1)
  useEffect(() => {
    followLatestMessageRef.current = true
    const messageList = messageListRef.current
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight
    }
  }, [activeConversationId])
  useEffect(() => {
    const messageList = messageListRef.current
    if (messageList && followLatestMessageRef.current) {
      messageList.scrollTop = messageList.scrollHeight
    }
  }, [lastMessage?.body, lastMessage?.stream?.reasoning, lastMessage?.stream?.stage, messages.length])
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (canSubmit) {
      onSubmit()
    }
  }
  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!shouldSubmitAgentInputFromKey(event.nativeEvent) || !canSubmit) {
      return
    }
    event.preventDefault()
    onSubmit()
  }
  const handleCreateConversation = () => {
    onDraftChange('')
    onCreateConversation()
  }

  return (
    <aside
      aria-hidden={!open}
      aria-label={t('project.assistant.panel')}
      className={`relative flex h-full w-full min-h-0 flex-col overflow-hidden border-l bg-[#ffffff]/96 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur will-change-transform transition-[border-color,box-shadow,opacity,transform] duration-[220ms] ease-out motion-reduce:transition-none ${
        open
          ? 'pointer-events-auto translate-x-0 border-[#d6dbe3] opacity-100'
          : 'pointer-events-none translate-x-full border-transparent opacity-0 shadow-none'
      }`}
      inert={!open}
    >
      <div
        aria-label={t('project.assistant.resize')}
        aria-orientation="vertical"
        aria-valuemax={maxWidth}
        aria-valuemin={assistantPanelMinWidth}
        aria-valuenow={width}
        className="group absolute left-0 top-0 z-40 h-full w-2 cursor-col-resize"
        onPointerDown={onResizePointerDown}
        role="separator"
        title={t('project.assistant.resize')}
      >
        <span className="absolute bottom-3 left-0 top-3 w-px rounded-full bg-transparent transition group-hover:bg-[#94a3b8]" />
      </div>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#e2e8f0] px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
            <BotMessageSquare className="size-4 text-[#2563eb]" />
            {t('project.assistant.assistant')}
          </div>
          <p className="mt-0.5 truncate text-[11px] leading-4 text-[#64748b]">
            {t('project.assistant.sourceCount', { count: sourceCount })}
          </p>
        </div>
        <Button aria-label={t('project.topbar.closeAssistant')} onClick={onClose} size="icon" title={t('project.topbar.closeAssistant')} type="button" variant="ghost">
          <X />
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-[#e2e8f0] px-3 py-2">
        <label className="sr-only" htmlFor="project-ai-conversation">
          {t('project.assistant.conversation')}
        </label>
        <select
          className="h-8 min-w-0 rounded-md border border-[#d6dbe3] bg-white px-2 text-xs font-medium text-[#0f172a] outline-none transition focus:border-[#94a3b8] focus:ring-2 focus:ring-[#bfdbfe]"
          disabled={conversations.length === 0 || isPending}
          id="project-ai-conversation"
          onChange={(event) => onSelectConversation(event.target.value)}
          value={activeConversationId}
        >
          {conversations.length === 0 ? (
            <option value="">{t('project.assistant.noChats')}</option>
          ) : (
            conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title}
              </option>
            ))
          )}
        </select>
        <Button
          aria-label={t('project.assistant.newChat')}
          disabled={isPending}
          onClick={handleCreateConversation}
          size="icon-sm"
          title={t('project.assistant.newChat')}
          type="button"
          variant="outline"
        >
          <Plus />
        </Button>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-3 py-4"
        onScroll={(event) => {
          const target = event.currentTarget
          followLatestMessageRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 48
        }}
        ref={messageListRef}
      >
        {messages.map((message) => (
          <div
            className={`min-w-0 max-w-[96%] overflow-hidden break-words rounded-md px-3 py-2 text-sm leading-6 ${
              message.role === 'user'
                ? 'ml-auto bg-[#0f172a] text-white'
                : 'mr-auto border border-[#e2e8f0] bg-white/80 text-[#1f2937]'
            }`}
            key={message.id}
          >
            {message.role === 'assistant' ? (
              <AssistantMessageContent message={message} />
            ) : (
              <AgentMarkdown tone={message.role}>{message.body}</AgentMarkdown>
            )}
          </div>
        ))}
      </div>

      <form
        className="m-4 rounded-xl border border-[#d6dbe3] bg-white/95 p-2 shadow-[0_6px_22px_rgba(15,23,42,0.08)] transition focus-within:border-[#94a3b8] focus-within:shadow-[0_8px_30px_rgba(15,23,42,0.12)]"
        onSubmit={submit}
      >
        {isPending && pendingKind === 'parametric' ? (
          <div className="mb-2 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 text-[#1e3a8a]" role="status">
            <div className="flex items-start gap-2">
              <RefreshCw className="mt-0.5 size-4 animate-spin motion-reduce:animate-none" />
              <div className="min-w-0">
                <div className="text-xs font-semibold">{t('project.assistant.progress.title')}</div>
                <div className="mt-0.5 text-[11px] leading-5 text-[#1d4ed8]">
                  {t('project.assistant.progress.body', { attempt: parametricProgress?.attempt ?? 1 })}
                </div>
              </div>
            </div>
            {progressPrompt ? (
              <div className="mt-2 rounded-md border border-[#bfdbfe] bg-white/70 px-2 py-1.5 text-[11px] leading-5 text-[#1e40af]">
                <span className="font-semibold">{t('project.assistant.progress.promptLabel')}</span> {progressPrompt}
              </div>
            ) : null}
            {revisionModelName ? (
              <div className="mt-2 rounded-md border border-[#bfdbfe] bg-white/70 px-2 py-1.5 text-[11px] leading-5 text-[#1e40af]">
                <span className="font-semibold">{t('project.assistant.progress.revisionLabel')}</span> {revisionModelName}
              </div>
            ) : null}
            <ol className="mt-2 grid gap-1.5 text-[11px] leading-5">
              {parametricProgressStepKeys.map((key, index) => {
                const isCurrentStep = index === 1
                const Icon = index === 0 ? CheckCircle2 : isCurrentStep ? Clock3 : Box
                return (
                  <li className="flex items-center gap-2" key={key}>
                    <Icon className={`size-3.5 ${isCurrentStep ? 'text-[#2563eb]' : 'text-[#60a5fa]'}`} />
                    <span className={isCurrentStep ? 'font-semibold' : ''}>{t(key)}</span>
                  </li>
                )
              })}
            </ol>
          </div>
        ) : null}
        {parametricRunError && (
          <div className="mb-2 rounded-lg border border-[#fecaca] bg-[#fff7ed] px-3 py-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#991b1b]">
                  <AlertTriangle className="size-3.5" />
                  {t('project.assistant.failure.title')}
                </div>
                <div className="mt-1 text-[11px] leading-5 text-[#9a3412]">{parametricRunError}</div>
              </div>
              <Button
                aria-label={t('project.assistant.retryGeneration')}
                disabled={!canRetryParametric}
                onClick={onRetryParametric}
                size="icon-sm"
                title={t('project.assistant.retryGeneration')}
                type="button"
                variant="outline"
              >
                <RefreshCw />
              </Button>
            </div>
            {retryParametricPrompt.trim() ? (
              <div className="mt-2 rounded-md border border-[#fed7aa] bg-white/70 px-2 py-1.5 text-[11px] leading-5 text-[#9a3412]">
                <span className="font-semibold">{t('project.assistant.failure.promptLabel')}</span> {retryParametricPrompt}
              </div>
            ) : null}
            <div className="mt-2 text-[11px] leading-5 text-[#9a3412]">{t('project.assistant.failure.guidance')}</div>
          </div>
        )}
        <label className="sr-only" htmlFor="project-ai-chat-input">
          {t('project.assistant.messageAssistant')}
        </label>
        <textarea
          className="min-h-20 w-full resize-none rounded-lg bg-transparent px-2 py-2 text-sm leading-6 text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
          id="project-ai-chat-input"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={t('project.assistant.placeholder')}
          readOnly={isPending}
          value={draft}
        />
        <div className="flex items-center justify-between gap-2 px-1 pb-1">
          <div className="h-6 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2 font-mono text-[10px] uppercase leading-6 text-[#64748b]">
            {revisionModelName && !isPending ? t('project.assistant.status.revisingModel') : statusLabel}
          </div>
          <div className="flex items-center gap-1">
            <Button
              aria-label={t('project.assistant.generateModel')}
              disabled={!canGenerate}
              onClick={onGenerateParametric}
              size="icon-sm"
              title={t('project.assistant.generateModel')}
              type="button"
              variant="outline"
            >
              <Box />
            </Button>
            <Button aria-label={t('project.assistant.sendMessage')} disabled={!canSubmit} size="icon-sm" type="submit">
              <Send />
            </Button>
          </div>
        </div>
      </form>
    </aside>
  )
}

function AssistantMessageContent({ message }: { message: AiChatMessage }) {
  const { t } = useTranslation()
  const stream = message.stream
  if (!stream) {
    return <AgentMarkdown tone="assistant">{message.body}</AgentMarkdown>
  }

  const isStreaming = stream.state === 'active' && stream.stage !== 'complete'
  const stageLabel =
    stream.state === 'error'
      ? t('project.assistant.stream.interruptedTitle')
      : t(`project.assistant.stream.stages.${stream.stage}`)

  return (
    <>
      <div
        aria-label={t('project.assistant.stream.activity')}
        aria-live="polite"
        className={`border-l-2 pl-2.5 ${stream.state === 'error' ? 'border-[#f97316]' : 'border-[#3b82f6]'}`}
        role="status"
      >
        <div
          className={`flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${
            stream.state === 'error' ? 'text-[#9a3412]' : 'text-[#1d4ed8]'
          }`}
        >
          {stream.state === 'error' ? (
            <AlertTriangle className="size-3.5 shrink-0" />
          ) : stream.stage === 'complete' ? (
            <CheckCircle2 className="size-3.5 shrink-0" />
          ) : (
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-[#3b82f6] animate-pulse motion-reduce:animate-none"
            />
          )}
          <span>{stageLabel}</span>
          {isStreaming && message.body ? (
            <span className="text-[#64748b]">{t('project.assistant.stream.answering')}</span>
          ) : null}
        </div>

        {stream.reasoning ? (
          <div className="mt-2 rounded-md border border-[#dbeafe] bg-[#f8fbff] px-2.5 py-2">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">
              {t('project.assistant.stream.thoughtProcess')}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#475569]">{stream.reasoning}</p>
          </div>
        ) : null}

        {stream.state === 'error' ? (
          <div className="mt-2 text-xs leading-5 text-[#9a3412]">
            <p>{stream.error}</p>
            <p className="mt-1 text-[#c2410c]">{t('project.assistant.stream.interruptedGuidance')}</p>
          </div>
        ) : null}
      </div>

      {message.body ? (
        <div className="mt-2">
          <AgentMarkdown tone="assistant">{message.body}</AgentMarkdown>
          {isStreaming ? (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-[#2563eb] animate-pulse motion-reduce:animate-none"
            />
          ) : null}
        </div>
      ) : null}
    </>
  )
}
