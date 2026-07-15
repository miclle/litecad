import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectParametricArtifact } from 'src/types/project'
import { FeatureDSLGraphEditor } from './feature-dsl-graph-editor'

const initialSource =
  '{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":80}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",40,6]}]}'
const updatedSource =
  '{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":80}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",48,6]},{"id":"slot","type":"box_cut","origin":[20,10,0],"size":[8,20,6]}]}'
const nestedSource =
  '{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":80}},"features":[{"id":"body","type":"boolean","operation":"subtract","operands":[{"id":"blank","type":"box","origin":[0,0,0],"size":["width",40,6]},{"id":"bore","type":"cylinder","origin":[40,20,-1],"diameter":4,"height":8}]}]}'

afterEach(cleanup)

describe('FeatureDSLGraphEditor', () => {
  it('compiles changed graph source before applying it and can reset the draft', async () => {
    const compileFeatureDSL = vi.fn().mockResolvedValue(previewResult())
    const onSave = vi.fn()
    render(
      <FeatureDSLGraphEditor
        artifact={artifact()}
        compileFeatureDSL={compileFeatureDSL}
        debounceMs={0}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit complete source' }))
    const source = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Complete feature graph source' })
    expect(source.value).toBe(initialSource)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Apply graph' }).disabled).toBe(true)

    fireEvent.change(source, { target: { value: updatedSource } })

    await waitFor(() =>
      expect(compileFeatureDSL).toHaveBeenLastCalledWith({
        filename: 'graph-bracket.lcad.json',
        document: JSON.parse(updatedSource),
        parameterValues: { width: 96 },
      }),
    )
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Apply graph' }).disabled).toBe(false))
    expect(screen.getByText('base')).not.toBeNull()
    expect(screen.getByText('slot')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Apply graph' }))
    expect(onSave).toHaveBeenCalledWith(updatedSource)

    fireEvent.click(screen.getByRole('button', { name: 'Reset feature graph' }))
    expect(source.value).toBe(initialSource)
  })

  it('keeps Apply disabled when browser-kernel compilation fails', async () => {
    const compileFeatureDSL = vi.fn().mockResolvedValueOnce(previewResult()).mockRejectedValueOnce(new Error('Graph cannot compile'))
    render(
      <FeatureDSLGraphEditor
        artifact={artifact()}
        compileFeatureDSL={compileFeatureDSL}
        debounceMs={0}
        onSave={vi.fn()}
      />,
    )

    await waitFor(() => expect(compileFeatureDSL).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Edit complete source' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Complete feature graph source' }), { target: { value: updatedSource } })

    await waitFor(() => expect(screen.getByText('Graph cannot compile')).not.toBeNull())
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Apply graph' }).disabled).toBe(true)
  })

  it('rejects parameter envelope edits before applying the graph', async () => {
    const compileFeatureDSL = vi.fn().mockResolvedValue(previewResult())
    const changedParameterSource = initialSource.replace('"default":80', '"default":96')
    render(
      <FeatureDSLGraphEditor
        artifact={artifact()}
        compileFeatureDSL={compileFeatureDSL}
        debounceMs={0}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit complete source' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Complete feature graph source' }), { target: { value: changedParameterSource } })

    await waitFor(() => expect(screen.getByText('Only feature nodes can be changed here. Use the parameter controls for parameter values.')).not.toBeNull())
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Apply graph' }).disabled).toBe(true)
  })

  it('can reset invalid node JSON and an invalid complete source', async () => {
    render(
      <FeatureDSLGraphEditor
        artifact={artifact()}
        compileFeatureDSL={vi.fn().mockResolvedValue(previewResult())}
        debounceMs={0}
        onSave={vi.fn()}
      />,
    )

    const nodeSource = screen.getByRole('textbox', { name: 'Selected node source' })
    fireEvent.change(nodeSource, { target: { value: '{' } })
    const reset = screen.getByRole<HTMLButtonElement>('button', { name: 'Reset feature graph' })
    expect(reset.disabled).toBe(false)
    fireEvent.click(reset)
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Selected node source' }).value).toContain('"id": "base"')

    fireEvent.click(screen.getByRole('button', { name: 'Edit complete source' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Complete feature graph source' }), { target: { value: '{' } })
    expect(screen.queryByRole('textbox', { name: 'Selected node source' })).toBeNull()
    expect(reset.disabled).toBe(false)
    fireEvent.click(reset)
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Selected node source' }).value).toContain('"id": "base"')
  })

  it('edits one stable nested node while preserving its boolean parent and siblings', async () => {
    const compileFeatureDSL = vi.fn().mockResolvedValue(previewResult())
    const onSave = vi.fn()
    render(
      <FeatureDSLGraphEditor
        artifact={{ ...artifact(), source_code: nestedSource }}
        compileFeatureDSL={compileFeatureDSL}
        debounceMs={0}
        onSave={onSave}
      />,
    )

    expect(screen.getByText('Feature graph · v1 · 3 nodes')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Select graph node bore' }))
    const nodeSource = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Selected node source' })
    expect(nodeSource.value).toContain('"diameter": 4')
    expect(nodeSource.value).not.toContain('blank')
    expect(screen.getByText('features/body/operands/bore')).not.toBeNull()

    fireEvent.change(nodeSource, {
      target: {
        value: '{"id":"bore","type":"cylinder","origin":[40,20,-1],"diameter":6,"height":8}',
      },
    })

    await waitFor(() =>
      expect(compileFeatureDSL).toHaveBeenLastCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            features: [
              expect.objectContaining({
                id: 'body',
                operands: [expect.objectContaining({ id: 'blank' }), expect.objectContaining({ id: 'bore', diameter: 6 })],
              }),
            ],
          }),
        }),
      ),
    )
    const applyButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Apply graph' })
    await waitFor(() => expect(applyButton.disabled).toBe(false))
    fireEvent.click(applyButton)
    const savedSource = onSave.mock.calls[0]?.[0] as string
    expect(JSON.parse(savedSource).features[0].operands).toEqual([
      expect.objectContaining({ id: 'blank' }),
      expect.objectContaining({ id: 'bore', diameter: 6 }),
    ])

    fireEvent.change(nodeSource, { target: { value: '{"id":"renamed-bore","type":"cylinder"}' } })
    expect(screen.getByText('Node ID must remain bore.')).not.toBeNull()
    expect(applyButton.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Reset feature graph' }))
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Selected node source' }).value).toContain('"id": "body"')
  })
})

function artifact(): ProjectParametricArtifact {
  return {
    id: 'model-graph-bracket',
    project_id: 'prj_graph',
    conversation_id: '',
    message_id: '',
    title: 'Graph bracket',
    source_kind: 'litecad-feature-dsl',
    source_code: initialSource,
    parameter_values: { width: 96 },
    compile_status: 'success',
    compile_error: '',
    preview_model_id: 'mdl_graph',
    generation_tool_mode: '',
    generation_duration_ms: 0,
    created_at: '2026-07-14T00:00:00Z',
    updated_at: '2026-07-14T00:00:00Z',
  }
}

function previewResult() {
  return {
    mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0] },
    meshSummary: { vertexCount: 1, triangleCount: 0, hasNormals: true },
  }
}
