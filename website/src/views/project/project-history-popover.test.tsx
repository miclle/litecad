import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import type { CADHistoryEntry } from 'src/types/project'
import { ProjectHistoryPopover } from './project-history-popover'

const entries: CADHistoryEntry[] = [
  {
    id: 'history_one',
    sequence: 3,
    status: 'applied',
    command_type: 'transform',
    target_id: 'node_one',
    summary: 'Move Bracket',
    created_at: '2026-07-10T00:00:00Z',
  },
]

afterEach(cleanup)

describe('ProjectHistoryPopover', () => {
  it('shares the command pending gate across undo, redo, and history paging', async () => {
    render(
      <TooltipProvider>
        <ProjectHistoryPopover
          canRedo
          canUndo
          entries={entries}
          error=""
          hasNextPage
          isFetchingNextPage={false}
          isLoading={false}
          isMutationPending
          loadError={false}
          onFetchNextPage={vi.fn()}
          onHistoryAction={vi.fn()}
          onOpenChange={vi.fn()}
          open
        />
      </TooltipProvider>,
    )

    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Move Bracket')).not.toBeNull()
  })

  it('forwards history actions when the shared gate is idle', async () => {
    const user = userEvent.setup()
    const onHistoryAction = vi.fn()
    render(
      <TooltipProvider>
        <ProjectHistoryPopover
          canRedo={false}
          canUndo
          entries={[]}
          error=""
          hasNextPage={false}
          isFetchingNextPage={false}
          isLoading={false}
          isMutationPending={false}
          loadError={false}
          onFetchNextPage={vi.fn()}
          onHistoryAction={onHistoryAction}
          onOpenChange={vi.fn()}
          open={false}
        />
      </TooltipProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onHistoryAction).toHaveBeenCalledWith('undo')
    expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows stable feature node transitions for graph history entries', () => {
    render(
      <TooltipProvider>
        <ProjectHistoryPopover
          canRedo={false}
          canUndo
          entries={[
            {
              id: 'history_graph',
              sequence: 4,
              status: 'applied',
              command_type: 'feature-graph-change',
              target_id: 'model_one',
              summary: 'Update feature graph for bracket.lcad.json',
              feature_graph_version: 1,
              feature_graph_transitions: [
                {
                  node_id: 'bore',
                  change: 'updated',
                  before_type: 'cylinder',
                  after_type: 'cylinder',
                  before_path: 'features/body/operands/bore',
                  after_path: 'features/body/operands/bore',
                  before_index: 1,
                  after_index: 1,
                },
                {
                  node_id: 'slot',
                  change: 'moved',
                  before_type: 'box_cut',
                  after_type: 'box_cut',
                  before_path: 'features/slot',
                  after_path: 'features/body/operands/slot',
                  before_index: 1,
                  after_index: 2,
                },
              ],
              created_at: '2026-07-14T00:00:00Z',
            },
          ]}
          error=""
          hasNextPage={false}
          isFetchingNextPage={false}
          isLoading={false}
          isMutationPending={false}
          loadError={false}
          onFetchNextPage={vi.fn()}
          onHistoryAction={vi.fn()}
          onOpenChange={vi.fn()}
          open
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('Feature graph v1')).not.toBeNull()
    expect(screen.getByText('features/body/operands/bore · Updated')).not.toBeNull()
    expect(screen.getByText('features/body/operands/slot · Moved')).not.toBeNull()
  })
})
