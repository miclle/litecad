import { BotMessageSquare, Box, Plus, Send, X } from 'lucide-react'
import type { FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

import { Button } from '@/components/ui/button'
import { AgentMarkdown } from './agent-markdown'
import { shouldSubmitAgentInputFromKey } from './agent-input'

export type AiChatMessage = {
  id: string
  role: 'assistant' | 'user'
  body: string
}

export type AssistantConversationSummary = {
  id: string
  title: string
  updated_at: string
}

type ProjectAssistantPanelProps = {
  activeConversationId?: string
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
  onSelectConversation: (conversationId: string) => void
  onSubmit: () => void
  open: boolean
  sourceCount: number
  width: number
}

const assistantPanelMinWidth = 340

export function ProjectAssistantPanel({
  activeConversationId = '',
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
  onSelectConversation,
  onSubmit,
  open,
  sourceCount,
  width,
}: ProjectAssistantPanelProps) {
  const hasActiveConversation = activeConversationId !== ''
  const canSubmit = draft.trim() !== '' && !isPending && hasActiveConversation
  const canGenerate = canSubmit
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
      aria-label="Assistant panel"
      className={`relative flex h-full w-full min-h-0 flex-col overflow-hidden border-l bg-[#ffffff]/96 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur will-change-transform transition-[border-color,box-shadow,opacity,transform] duration-[220ms] ease-out motion-reduce:transition-none ${
        open
          ? 'pointer-events-auto translate-x-0 border-[#d6dbe3] opacity-100'
          : 'pointer-events-none translate-x-full border-transparent opacity-0 shadow-none'
      }`}
      inert={!open}
    >
      <div
        aria-label="Resize Assistant panel"
        aria-orientation="vertical"
        aria-valuemax={maxWidth}
        aria-valuemin={assistantPanelMinWidth}
        aria-valuenow={width}
        className="group absolute left-0 top-0 z-40 h-full w-2 cursor-col-resize"
        onPointerDown={onResizePointerDown}
        role="separator"
        title="Resize Assistant panel"
      >
        <span className="absolute bottom-3 left-0 top-3 w-px rounded-full bg-transparent transition group-hover:bg-[#94a3b8]" />
      </div>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#e2e8f0] px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f172a]">
            <BotMessageSquare className="size-4 text-[#2563eb]" />
            Assistant
          </div>
          <p className="mt-0.5 truncate text-[11px] leading-4 text-[#64748b]">{sourceCount} project sources attached</p>
        </div>
        <Button aria-label="Close Assistant" onClick={onClose} size="icon" title="Close Assistant" type="button" variant="ghost">
          <X />
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-[#e2e8f0] px-3 py-2">
        <label className="sr-only" htmlFor="project-ai-conversation">
          Assistant conversation
        </label>
        <select
          className="h-8 min-w-0 rounded-md border border-[#d6dbe3] bg-white px-2 text-xs font-medium text-[#0f172a] outline-none transition focus:border-[#94a3b8] focus:ring-2 focus:ring-[#bfdbfe]"
          disabled={conversations.length === 0 || isPending}
          id="project-ai-conversation"
          onChange={(event) => onSelectConversation(event.target.value)}
          value={activeConversationId}
        >
          {conversations.length === 0 ? (
            <option value="">No chats yet</option>
          ) : (
            conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title}
              </option>
            ))
          )}
        </select>
        <Button aria-label="New chat" onClick={handleCreateConversation} size="icon-sm" title="New chat" type="button" variant="outline">
          <Plus />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
        {messages.map((message) => (
          <div
            className={`max-w-[96%] rounded-md px-3 py-2 text-sm leading-6 ${
              message.role === 'user'
                ? 'ml-auto bg-[#0f172a] text-white'
                : 'mr-auto border border-[#e2e8f0] bg-white/80 text-[#1f2937]'
            }`}
            key={message.id}
          >
            {message.role === 'assistant' ? <AgentMarkdown>{message.body}</AgentMarkdown> : message.body}
          </div>
        ))}
      </div>

      <form
        className="m-4 rounded-xl border border-[#d6dbe3] bg-white/95 p-2 shadow-[0_6px_22px_rgba(15,23,42,0.08)] transition focus-within:border-[#94a3b8] focus-within:shadow-[0_8px_30px_rgba(15,23,42,0.12)]"
        onSubmit={submit}
      >
        <label className="sr-only" htmlFor="project-ai-chat-input">
          Message Assistant
        </label>
        <textarea
          className="min-h-20 w-full resize-none rounded-lg bg-transparent px-2 py-2 text-sm leading-6 text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
          id="project-ai-chat-input"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Describe what to inspect or change"
          readOnly={isPending}
          value={draft}
        />
        <div className="flex items-center justify-between gap-2 px-1 pb-1">
          <div className="h-6 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2 font-mono text-[10px] uppercase leading-6 text-[#64748b]">
            {isPending ? 'Thinking' : hasActiveConversation ? 'Project context' : 'New chat required'}
          </div>
          <div className="flex items-center gap-1">
            <Button
              aria-label="Generate parametric model"
              disabled={!canGenerate}
              onClick={onGenerateParametric}
              size="icon-sm"
              title="Generate parametric model"
              type="button"
              variant="outline"
            >
              <Box />
            </Button>
            <Button aria-label="Send Assistant message" disabled={!canSubmit} size="icon-sm" type="submit">
              <Send />
            </Button>
          </div>
        </div>
      </form>
    </aside>
  )
}
