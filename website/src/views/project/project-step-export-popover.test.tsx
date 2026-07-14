import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import type { StepExportTarget } from './project-step-export'
import { ProjectStepExportPopover } from './project-step-export-popover'

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

describe('ProjectStepExportPopover', () => {
  it('stays open and renders durable feedback when export fails', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <TooltipProvider>
        <ProjectStepExportPopover
          disabled={false}
          onExport={vi.fn().mockRejectedValue(new Error('worker failed'))}
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
})
