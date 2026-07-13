import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'

import { AgentMarkdown } from './agent-markdown'

beforeAll(() => {
  if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  }
  if (typeof Range !== 'undefined' && !Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => new DOMRect()
  }
})

afterEach(() => {
  cleanup()
})

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

  test('renders fenced code as a collapsible read-only CodeMirror block', () => {
    const code = JSON.stringify({
      tool: 'build_parametric_model',
      input: {
        title: 'Browser Feature Graph AST 45',
        code: '{"version":1,"unit":"millimetre","features":[{"id":"long_body","type":"box","origin":[0,0,0],"size":[20,20,8]}]}',
      },
    }).repeat(8)

    const { container } = render(<AgentMarkdown>{`\`\`\`json\n${code}\n\`\`\``}</AgentMarkdown>)

    expect(container.querySelector('[data-agent-code-block]')).toBeTruthy()
    expect(container.querySelector('.cm-editor')).toBeTruthy()
    expect(container.querySelector('pre')).toBeNull()
    expect(screen.getByText('json')).toBeTruthy()

    const toggle = screen.getByRole('button', { name: 'Expand' })
    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy()
  })

  test('promotes long embedded JSON in user messages into a CodeMirror block', () => {
    const embeddedJSON = JSON.stringify({
      tool: 'build_parametric_model',
      input: {
        title: 'Browser Feature Graph AST 45',
        source_kind: 'litecad-feature-dsl',
        code: JSON.stringify({
          version: 1,
          unit: 'millimetre',
          features: Array.from({ length: 18 }, (_entry, index) => ({
            id: `body_${index}`,
            origin: [index * 24, 0, 0],
            size: [20, 20, 8],
            type: 'box',
          })),
        }),
      },
    })

    const { container } = render(<AgentMarkdown tone="user">{`Create this model:\n${embeddedJSON}\nReturn only tool JSON.`}</AgentMarkdown>)

    expect(container.querySelector('[data-agent-code-block]')).toBeTruthy()
    expect(container.querySelector('.cm-editor')).toBeTruthy()
    expect(screen.getByText('Create this model:')).toBeTruthy()
    expect(screen.getByText('Return only tool JSON.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Expand' })).toBeTruthy()
  })
})
