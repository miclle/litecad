import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import i18n from 'src/i18n'
import type { CADSubassemblyDefinitionRevision } from 'src/types/project'
import { ProjectSubassemblies } from './project-subassemblies'

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const

const definitions: CADSubassemblyDefinitionRevision[] = [
  {
    id: 'sub_drive',
    revision: 1,
    name: 'Drive module',
    members: [
      {
        id: 'smb_drive',
        node_id: 'node_drive',
        model_id: 'model_drive',
        model_revision_id: 'mvr_drive',
        name: 'Drive',
        suppressed: false,
        relative_transform: { matrix: identityMatrix },
      },
    ],
  },
]

describe('ProjectSubassemblies', () => {
  it('hides the saved-combinations section until a combination exists', () => {
    render(<ProjectSubassemblies definitions={[]} onInstantiate={vi.fn()} />)

    expect(screen.queryByTestId('project-subassemblies')).toBeNull()
  })

  it('keeps saved combinations collapsed until the user asks for them', async () => {
    const user = userEvent.setup()
    render(<ProjectSubassemblies definitions={definitions} onInstantiate={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Saved combinations, 1 combination' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Drive module · 1 model')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Saved combinations, 1 combination' }))

    expect(screen.getByText('Drive module · 1 model')).toBeTruthy()
  })

  it('inserts a copy with a useful default name before optional position is expanded', async () => {
    const user = userEvent.setup()
    const onInstantiate = vi.fn()
    render(<ProjectSubassemblies definitions={definitions} onInstantiate={onInstantiate} />)

    await user.click(screen.getByRole('button', { name: 'Saved combinations, 1 combination' }))
    await user.click(screen.getByRole('button', { name: 'Insert a copy of Drive module' }))

    expect((screen.getByRole('textbox', { name: 'Copy name' }) as HTMLInputElement).value).toBe('Drive module copy')
    expect(screen.queryByRole('spinbutton', { name: 'X position' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Position (optional)' }))
    await user.clear(screen.getByRole('spinbutton', { name: 'X position' }))
    await user.type(screen.getByRole('spinbutton', { name: 'X position' }), '100')
    await user.click(screen.getByRole('button', { name: 'Insert copy' }))

    expect(onInstantiate).toHaveBeenCalledWith('sub_drive', {
      name: 'Drive module copy',
      parent_group_id: '',
      translation: [100, 0, 0],
    })

    await user.click(screen.getByRole('button', { name: 'Insert a copy of Drive module' }))

    expect((screen.getByRole('textbox', { name: 'Copy name' }) as HTMLInputElement).value).toBe('Drive module copy')
    expect(screen.queryByRole('spinbutton', { name: 'X position' })).toBeNull()
  })

  it('keeps the copy draft available when insertion fails', async () => {
    const user = userEvent.setup()
    let rejectInsertion = (_error: Error) => {}
    const onInstantiate = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectInsertion = reject
        }),
    )
    render(<ProjectSubassemblies definitions={definitions} onInstantiate={onInstantiate} />)

    await user.click(screen.getByRole('button', { name: 'Saved combinations, 1 combination' }))
    await user.click(screen.getByRole('button', { name: 'Insert a copy of Drive module' }))
    await user.clear(screen.getByRole('textbox', { name: 'Copy name' }))
    await user.type(screen.getByRole('textbox', { name: 'Copy name' }), 'Drive A')
    await user.click(screen.getByRole('button', { name: 'Position (optional)' }))
    await user.clear(screen.getByRole('spinbutton', { name: 'X position' }))
    await user.type(screen.getByRole('spinbutton', { name: 'X position' }), '120')
    await user.click(screen.getByRole('button', { name: 'Insert copy' }))

    expect((screen.getByRole('textbox', { name: 'Copy name' }) as HTMLInputElement).value).toBe('Drive A')
    expect((screen.getByRole('spinbutton', { name: 'X position' }) as HTMLInputElement).value).toBe('120')

    await act(async () => rejectInsertion(new Error('request failed')))

    expect((screen.getByRole('textbox', { name: 'Copy name' }) as HTMLInputElement).value).toBe('Drive A')
    expect((screen.getByRole('spinbutton', { name: 'X position' }) as HTMLInputElement).value).toBe('120')
  })

  it('uses the current language for a default copy name on first open', async () => {
    const user = userEvent.setup()
    render(<ProjectSubassemblies definitions={definitions} onInstantiate={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Saved combinations, 1 combination' }))
    await act(async () => i18n.changeLanguage('zh'))
    await user.click(screen.getByRole('button', { name: '插入 Drive module 的副本' }))

    expect((screen.getByRole('textbox', { name: '副本名称' }) as HTMLInputElement).value).toBe('Drive module 副本')
  })
})
