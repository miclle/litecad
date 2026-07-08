import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { AgentMarkdown } from './agent-markdown'

describe('AgentMarkdown', () => {
  test('renders common markdown syntax in assistant replies', () => {
    const html = renderToStaticMarkup(
      <AgentMarkdown>{'Hi **Evo**\n\n- source\n\n`unit`'}</AgentMarkdown>,
    )

    expect(html).toContain('<strong')
    expect(html).toContain('Evo')
    expect(html).toContain('<ul')
    expect(html).toContain('<li')
    expect(html).toContain('source')
    expect(html).toContain('<code')
    expect(html).not.toContain('**Evo**')
  })

  test('removes raw HTML from untrusted agent output', () => {
    const html = renderToStaticMarkup(
      <AgentMarkdown>{'Safe <img src=x onerror=alert(1)> **text**'}</AgentMarkdown>,
    )

    expect(html).toContain('<strong')
    expect(html).toContain('text')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror')
  })
})
