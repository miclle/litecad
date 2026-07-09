import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'

import { ProjectCoverPreview } from './index'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ProjectCoverPreview', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('renders a static snapshot image without mounting the 3D preview', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    await act(async () => {
      createRoot(host).render(
        <ProjectCoverPreview
          cardIndex={0}
          models={[]}
          snapshot={{
            url: '/api/v1/projects/prj_01test/thumbnail?revision=3',
            status: 'ready',
            revision: 3,
            width: 640,
            height: 360,
            updated_at: '2026-07-09T00:00:00Z',
          }}
        />,
      )
    })

    const image = document.querySelector('img')
    expect(image?.getAttribute('src')).toBe('/api/v1/projects/prj_01test/thumbnail?revision=3')
    expect(image?.getAttribute('loading')).toBe('lazy')
    expect(document.querySelector('[data-model-preview]')).toBeNull()
    expect(document.querySelector('canvas')).toBeNull()
  })
})
