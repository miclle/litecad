import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { Separator } from './separator'

describe('Separator', () => {
  afterEach(cleanup)

  test('applies visible dimensions for the horizontal orientation', () => {
    render(<Separator />)

    const separator = screen.getByRole('separator')
    expect(separator.classList.contains('h-px')).toBe(true)
    expect(separator.classList.contains('w-full')).toBe(true)
  })
})
