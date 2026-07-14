import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectParametricArtifact } from 'src/types/project'
import { FeatureDSLGraphEditor } from './feature-dsl-graph-editor'

const initialSource =
  '{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":80}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",40,6]}]}'
const updatedSource =
  '{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":80}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",48,6]},{"id":"slot","type":"box_cut","origin":[20,10,0],"size":[8,20,6]}]}'

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

    const source = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Feature graph source' })
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
    fireEvent.change(screen.getByRole('textbox', { name: 'Feature graph source' }), { target: { value: updatedSource } })

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

    fireEvent.change(screen.getByRole('textbox', { name: 'Feature graph source' }), { target: { value: changedParameterSource } })

    await waitFor(() => expect(screen.getByText('Only feature nodes can be changed here. Use the parameter controls for parameter values.')).not.toBeNull())
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Apply graph' }).disabled).toBe(true)
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
