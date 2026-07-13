import { json } from '@codemirror/lang-json'
import { EditorView } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import Markdown, { type Components as MarkdownComponents } from 'react-markdown'

const codeBlockCollapsedHeight = 260

const agentCodeMirrorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#0f172a',
    color: '#dbeafe',
    fontSize: '12px',
  },
  '.cm-content': {
    caretColor: '#dbeafe',
    padding: '12px 0',
  },
  '.cm-line': {
    padding: '0 12px',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    lineHeight: '1.55',
    overflow: 'visible',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#1d4ed8 !important',
  },
})

function languageLabelFromClassName(className = '') {
  return className
    .split(/\s+/)
    .find((entry) => entry.startsWith('language-'))
    ?.replace('language-', '')
}

function shouldCollapseCode(code: string) {
  return code.length > 700 || code.split(/\r?\n/).length > 12
}

function findBalancedJSONEnd(source: string, start: number) {
  const stack: string[] = []
  let inString = false
  let isEscaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      if (isEscaped) {
        isEscaped = false
      } else if (character === '\\') {
        isEscaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{' || character === '[') {
      stack.push(character === '{' ? '}' : ']')
      continue
    }
    if (character === '}' || character === ']') {
      if (stack.pop() !== character) {
        return -1
      }
      if (stack.length === 0) {
        return index + 1
      }
    }
  }
  return -1
}

function findEmbeddedJSONSnippet(source: string) {
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '{' && source[index] !== '[') {
      continue
    }
    const end = findBalancedJSONEnd(source, index)
    if (end <= index) {
      continue
    }
    const snippet = source.slice(index, end)
    if (snippet.length < 120) {
      continue
    }
    try {
      return {
        end,
        formatted: JSON.stringify(JSON.parse(snippet), null, 2),
        start: index,
      }
    } catch {
      // Keep scanning; assistant/user prose may contain braces that are not JSON.
    }
  }
  return null
}

function formatAgentMarkdownSource(source: string) {
  if (source.includes('```')) {
    return source
  }
  const snippet = findEmbeddedJSONSnippet(source)
  if (!snippet) {
    return source
  }
  const before = source.slice(0, snippet.start).trimEnd()
  const after = source.slice(snippet.end).trimStart()
  return `${before}\n\n\`\`\`json\n${snippet.formatted}\n\`\`\`\n\n${after}`.trim()
}

function AgentCodeBlock({ className, code }: { className?: string; code: string }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const language = languageLabelFromClassName(className) ?? 'code'
  const isCollapsible = shouldCollapseCode(code)
  const extensions = useMemo(() => {
    const baseExtensions = [EditorView.lineWrapping, agentCodeMirrorTheme]
    return language === 'json' ? [json(), ...baseExtensions] : baseExtensions
  }, [language])

  return (
    <div className="mb-2 max-w-full overflow-hidden rounded-md border border-[#1e293b] bg-[#0f172a] text-[#dbeafe] last:mb-0" data-agent-code-block>
      <div className="flex h-8 items-center justify-between border-b border-[#1e293b] px-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#93c5fd]">{language}</span>
        {isCollapsible && (
          <button
            className="inline-flex h-6 items-center gap-1 rounded border border-[#334155] px-2 text-[11px] font-medium text-[#dbeafe] transition hover:border-[#60a5fa] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
            onClick={() => setIsExpanded((value) => !value)}
            type="button"
          >
            {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
      <div className="max-w-full overflow-hidden" style={isCollapsible && !isExpanded ? { maxHeight: codeBlockCollapsedHeight } : undefined}>
        <CodeMirror
          basicSetup={false}
          editable={false}
          extensions={extensions}
          readOnly
          theme="none"
          value={code.replace(/\n$/, '')}
        />
      </div>
    </div>
  )
}

const agentMarkdownComponents = {
  p({ children, ...props }) {
    return (
      <p className="mb-2 last:mb-0" {...props}>
        {children}
      </p>
    )
  },
  ul({ children, ...props }) {
    return (
      <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0" {...props}>
        {children}
      </ul>
    )
  },
  ol({ children, ...props }) {
    return (
      <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0" {...props}>
        {children}
      </ol>
    )
  },
  li({ children, ...props }) {
    return (
      <li className="pl-1" {...props}>
        {children}
      </li>
    )
  },
  strong({ children, ...props }) {
    return (
      <strong className="font-semibold text-inherit" {...props}>
        {children}
      </strong>
    )
  },
  a({ children, ...props }) {
    return (
      <a className="font-medium text-[#1d4ed8] underline underline-offset-2" rel="noreferrer" target="_blank" {...props}>
        {children}
      </a>
    )
  },
  code({ children, className, ...props }) {
    const isBlockCode = Boolean(className)
    if (isBlockCode) {
      return <AgentCodeBlock className={className} code={String(children)} />
    }
    return (
      <code
        className="break-words rounded bg-[#f1f5f9] px-1 py-0.5 font-mono text-[12px] text-[#334155]"
        {...props}
      >
        {children}
      </code>
    )
  },
  pre({ children }) {
    return <>{children}</>
  },
} satisfies MarkdownComponents

interface AgentMarkdownProps {
  children: string
  tone?: 'assistant' | 'user'
}

export function AgentMarkdown({ children, tone = 'assistant' }: AgentMarkdownProps) {
  const markdownSource = useMemo(() => formatAgentMarkdownSource(children), [children])
  return (
    <div className={`min-w-0 overflow-hidden text-sm leading-6 ${tone === 'user' ? 'text-white' : 'text-[#1f2937]'}`}>
      <Markdown components={agentMarkdownComponents} skipHtml>
        {markdownSource}
      </Markdown>
    </div>
  )
}
