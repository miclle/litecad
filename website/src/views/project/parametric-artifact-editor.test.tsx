import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectParametricArtifact } from 'src/types/project'
import { ParametricArtifactEditor } from './parametric-artifact-editor'

const artifact = {
  id: 'pma_bracket',
  project_id: 'prj_one',
  conversation_id: 'agc_one',
  message_id: 'agm_one',
  title: 'Mounting bracket',
  source_kind: 'openscad',
  source_code: 'width = 20; // [10:1:80]\nstyle = "round"; // [round, square]\ncentered = true;\ncube([width, 10, 5]);',
  parameter_values: {},
  compile_status: 'pending',
  compile_error: '',
  preview_model_id: '',
  created_at: '2026-07-11T00:00:00Z',
  updated_at: '2026-07-11T00:00:00Z',
} satisfies ProjectParametricArtifact

afterEach(() => cleanup())

describe('ParametricArtifactEditor', () => {
  it('renders parsed parameters and recompiles when a slider changes', async () => {
    const compile = vi.fn().mockResolvedValue({
      output: 'preview',
      bytes: new Uint8Array([1, 2, 3]),
      stdout: '',
      stderr: '',
      durationMs: 4,
    })

    render(<ParametricArtifactEditor artifact={artifact} compile={compile} debounceMs={0} />)

    expect(screen.getByRole('heading', { name: 'Mounting bracket' })).not.toBeNull()
    expect(screen.getByLabelText('width parameter')).not.toBeNull()

    fireEvent.change(screen.getByLabelText('width parameter'), { target: { value: '40' } })

    await waitFor(() => expect(compile).toHaveBeenLastCalledWith({ code: artifact.source_code, parameterValues: { width: 40, style: 'round', centered: true } }))
  })

  it('keeps compile errors visible and does not enable Save as model', async () => {
    const compile = vi.fn().mockRejectedValue(new Error('OpenSCAD runtime unavailable'))

    render(<ParametricArtifactEditor artifact={artifact} compile={compile} debounceMs={0} />)

    await waitFor(() => expect(screen.getByText('OpenSCAD runtime unavailable')).not.toBeNull())
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save as model' }).disabled).toBe(true)
  })

  it('saves parameter edits for an existing parametric model without requiring compile success', async () => {
    const compile = vi.fn().mockRejectedValue(new Error('OpenSCAD runtime unavailable'))
    const onSaveParameters = vi.fn()

    render(
      <ParametricArtifactEditor
        artifact={artifact}
        compile={compile}
        debounceMs={0}
        initialParameterValues={{ width: 30, style: 'square', centered: false }}
        onSaveParameters={onSaveParameters}
        saveLabel="Save parameters"
      />,
    )

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save parameters' }).disabled).toBe(false)
    fireEvent.change(screen.getByLabelText('width value'), { target: { value: '48' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save parameters' }))

    expect(onSaveParameters).toHaveBeenCalledWith({ width: 48, style: 'square', centered: false })
  })
})
