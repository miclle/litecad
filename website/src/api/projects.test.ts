import { describe, expect, test, vi } from 'vitest'

import client from './client'
import {
  fetchProjectCADDocument,
  fetchProjectAgentMessages,
  fetchProjectGeometryDocument,
  fetchProjectModelPreview,
  fetchProjectModelPreviewArtifact,
  fetchProjectModelSource,
  sendProjectAgentMessage,
  updateProjectCADModelTransform,
  uploadProjectModel,
} from './projects'

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}))

describe('project API', () => {
  test('uploads a project model as multipart form data', () => {
    const file = new File(['ISO-10303-21;'], 'macintosh_ipad_lcd_case.step', { type: 'application/step' })

    uploadProjectModel('prj_01test', file)

    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/models', expect.any(FormData))
    const formData = vi.mocked(client.post).mock.calls[0]?.[1] as FormData
    expect(formData.get('model')).toBe(file)
  })

  test('fetches a project model preview as a blob', () => {
    fetchProjectModelPreview('prj_01test', 'mdl_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/models/mdl_01test/preview', { responseType: 'blob' })
  })

  test('fetches a project model source as a blob', () => {
    fetchProjectModelSource('prj_01test', 'mdl_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/models/mdl_01test/source', { responseType: 'blob' })
  })

  test('fetches project model preview artifact metadata', () => {
    fetchProjectModelPreviewArtifact('prj_01test', 'mdl_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/models/mdl_01test/preview-artifact')
  })

  test('fetches a project geometry document', () => {
    fetchProjectGeometryDocument('prj_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/geometry')
  })

  test('fetches a project CAD document', () => {
    fetchProjectCADDocument('prj_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/cad-document')
  })

  test('updates a project CAD model transform', () => {
    const transform = {
      matrix: [1, 0, 0, 12, 0, 1, 0, -4, 0, 0, 1, 8, 0, 0, 0, 1] as const,
    }

    updateProjectCADModelTransform('prj_01test', 'mdl_01test', transform)

    expect(client.patch).toHaveBeenCalledWith('/projects/prj_01test/cad-document/models/mdl_01test/transform', {
      transform,
    })
  })

  test('sends project agent messages', () => {
    const payload = {
      messages: [{ role: 'user' as const, body: 'Inspect the model' }],
    }

    sendProjectAgentMessage('prj_01test', payload)

    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/agent/messages', payload)
  })

  test('fetches project agent messages', () => {
    fetchProjectAgentMessages('prj_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/agent/messages')
  })
})
