import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectSectionArtifact } from 'src/types/project'
import { projectSectionArtifactState, useProjectSectionArtifactsController } from './use-project-section-artifacts-controller'
import type { StepExportTarget } from './project-step-export'

const target: StepExportTarget = {
  occurrenceId: 'occ_1', modelId: 'mdl_1', modelRevisionId: 'pmr_1', sourceFormat: 'step',
  displayName: 'Part', sourceFilename: 'part.step', downloadFilename: 'part.step', operations: [],
}

describe('projectSectionArtifactState', () => {
  it('distinguishes current, stale, superseded, and legacy generations', () => {
    const artifact = sectionArtifact()
    expect(projectSectionArtifactState(artifact, 4, [target])).toBe('current')
    expect(projectSectionArtifactState({ ...artifact, cad_document_revision: 3 }, 4, [target])).toBe('stale')
    expect(projectSectionArtifactState({ ...artifact, source_revision_ids: ['pmr_2'] }, 4, [target])).toBe('stale')
    expect(projectSectionArtifactState({ ...artifact, is_latest: false }, 4, [target])).toBe('superseded')
    expect(projectSectionArtifactState({ ...artifact, association_id: '', generation: 0 }, 4, [target])).toBe('legacy')
  })
})

describe('useProjectSectionArtifactsController', () => {
  it('persists kernel section planes in millimetres', async () => {
    const createArtifact = vi.fn(async () => undefined)
    const { result } = renderHook(
      () =>
        useProjectSectionArtifactsController({
          cadDocumentRevision: 7,
          dependencies: {
            createArtifact,
            fetchArtifacts: vi.fn(async () => []),
            generateGeometry: vi.fn(async () => ({
              status: 'ready' as const,
              edgeCount: 4,
              exportedStepText: 'ISO-10303-21; SECTION',
            })),
          },
          filename: 'inch-source-section.step',
          projectId: 'prj_inch',
          targets: [target],
          visiblePreviewIds: [target.occurrenceId],
        }),
      { wrapper: queryWrapper() },
    )

    act(() => result.current.generateSectionArtifact({ x: 25.4, y: 0, z: 0 }))

    await waitFor(() => expect(createArtifact).toHaveBeenCalledWith('prj_inch', expect.objectContaining({
      plane_origin: { x: 25.4, y: 0, z: 0 },
      unit: 'millimetre',
    })))
  })

  it('captures artifact download failures for user-visible feedback', async () => {
    const artifact = sectionArtifact()
    const { result } = renderHook(
      () =>
        useProjectSectionArtifactsController({
          cadDocumentRevision: 4,
          dependencies: {
            downloadArtifact: vi.fn(async () => {
              throw new Error('artifact download failed')
            }),
            fetchArtifacts: vi.fn(async () => [artifact]),
          },
          filename: artifact.filename,
          projectId: artifact.project_id,
          targets: [target],
          visiblePreviewIds: [target.occurrenceId],
        }),
      { wrapper: queryWrapper() },
    )
    await waitFor(() => expect(result.current.sectionArtifacts).toHaveLength(1))

    await act(async () => result.current.downloadSectionArtifact(artifact.id))

    await waitFor(() => expect(result.current.sectionArtifactError).toBe('artifact download failed'))
  })
})

function sectionArtifact(): ProjectSectionArtifact {
  return {
    id: 'pse_1', project_id: 'prj_1', association_id: 'psd_1', generation: 1, supersedes_artifact_id: '', is_latest: true,
    cad_document_revision: 4, unit: 'mm', status: 'ready', filename: 'section.step', content_type: 'model/step',
    target_count: 1, source_revision_ids: ['pmr_1'], occurrence_ids: ['occ_1'],
    plane_origin: { x: 0, y: 0, z: 0 }, plane_normal: { x: 1, y: 0, z: 0 }, edge_count: 4, byte_size: 100,
    created_at: '2026-07-15T00:00:00Z', updated_at: '2026-07-15T00:00:00Z',
  }
}

function queryWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}
