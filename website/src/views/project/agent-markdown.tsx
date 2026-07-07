import Markdown, { type Components as MarkdownComponents } from 'react-markdown'

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
      <strong className="font-semibold text-[#0f172a]" {...props}>
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
    return (
      <code
        className={
          isBlockCode
            ? `font-mono text-[12px] text-inherit ${className ?? ''}`
            : 'rounded bg-[#f1f5f9] px-1 py-0.5 font-mono text-[12px] text-[#334155]'
        }
        {...props}
      >
        {children}
      </code>
    )
  },
  pre({ children, ...props }) {
    return (
      <pre className="mb-2 overflow-x-auto rounded-md bg-[#0f172a] p-3 text-[12px] leading-5 text-[#e2e8f0] last:mb-0" {...props}>
        {children}
      </pre>
    )
  },
} satisfies MarkdownComponents

interface AgentMarkdownProps {
  children: string
}

export function AgentMarkdown({ children }: AgentMarkdownProps) {
  return (
    <div className="text-sm leading-6 text-[#1f2937]">
      <Markdown components={agentMarkdownComponents} skipHtml>
        {children}
      </Markdown>
    </div>
  )
}
