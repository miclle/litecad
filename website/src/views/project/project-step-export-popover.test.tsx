import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import type { StepExportTarget } from './project-step-export'
import { ProjectStepExportPopover } from './project-step-export-popover'
import type { ProjectExportArtifact } from 'src/types/project'

const targets: StepExportTarget[] = [
  {
	occurrenceId: 'occurrence_model_one',
    modelId: 'model_one',
	modelRevisionId: 'mvr_model_one',
    sourceFormat: 'step',
    displayName: 'Bracket',
    sourceFilename: 'bracket.step',
    downloadFilename: 'bracket-litecad-r3.step',
    operations: [],
  },
]

const exportArtifacts: ProjectExportArtifact[] = [
  {
    id: 'pex_01test',
    project_id: 'prj_01test',
    filename: 'assembly-litecad-assembly-r3.step',
    content_type: 'model/step',
    export_kind: 'merged',
    target_count: 2,
    source_revision_ids: ['mvr_a', 'mvr_b'],
    occurrence_ids: ['occ_a', 'occ_b'],
    byte_size: 1536,
    created_at: '2026-07-14T12:00:00Z',
    updated_at: '2026-07-14T12:00:00Z',
  },
]

describe('ProjectStepExportPopover', () => {
  it('stays open and renders durable feedback when export fails', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <TooltipProvider>
        <ProjectStepExportPopover
          disabled={false}
          exportArtifacts={[]}
          isExportHistoryError={false}
          isExportHistoryLoading={false}
          onExport={vi.fn().mockRejectedValue(new Error('worker failed'))}
          onDownloadExportArtifact={vi.fn()}
          onOpenChange={onOpenChange}
          onSelectAll={vi.fn()}
          onToggleTarget={vi.fn()}
          open
			selectedTargetIds={new Set(['occurrence_model_one'])}
          targets={targets}
        />
      </TooltipProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Merged STEP' }))

    expect(await screen.findByText('STEP export failed')).not.toBeNull()
    expect(screen.getByRole('dialog', { name: 'Export STEP' })).not.toBeNull()
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
  })

  it('renders stored export history and downloads one artifact', async () => {
    const user = userEvent.setup()
    const onDownloadExportArtifact = vi.fn(async () => undefined)
    render(
      <TooltipProvider>
        <ProjectStepExportPopover
          disabled={false}
          exportArtifacts={exportArtifacts}
          isExportHistoryError={false}
          isExportHistoryLoading={false}
          onDownloadExportArtifact={onDownloadExportArtifact}
          onExport={vi.fn()}
          onOpenChange={vi.fn()}
          onSelectAll={vi.fn()}
          onToggleTarget={vi.fn()}
          open
          selectedTargetIds={new Set(['occurrence_model_one'])}
          targets={targets}
        />
      </TooltipProvider>,
    )

    expect(screen.getAllByText('Export history').length).toBeGreaterThan(0)
    expect(screen.getByText('assembly-litecad-assembly-r3.step')).not.toBeNull()
    expect(screen.getByText('2 targets · 1.5 KB')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Download assembly-litecad-assembly-r3.step' }))

    expect(onDownloadExportArtifact).toHaveBeenCalledWith('pex_01test')
  })
})
