import { describe, expect, it } from 'vitest'

import type { ProjectSectionArtifact } from 'src/types/project'
import { projectSectionArtifactState } from './use-project-section-artifacts-controller'
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

function sectionArtifact(): ProjectSectionArtifact {
  return {
    id: 'pse_1', project_id: 'prj_1', association_id: 'psd_1', generation: 1, supersedes_artifact_id: '', is_latest: true,
    cad_document_revision: 4, unit: 'mm', status: 'ready', filename: 'section.step', content_type: 'model/step',
    target_count: 1, source_revision_ids: ['pmr_1'], occurrence_ids: ['occ_1'],
    plane_origin: { x: 0, y: 0, z: 0 }, plane_normal: { x: 1, y: 0, z: 0 }, edge_count: 4, byte_size: 100,
    created_at: '2026-07-15T00:00:00Z', updated_at: '2026-07-15T00:00:00Z',
  }
}
