import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { AppContext } from 'src/context/app'
import i18n from 'src/i18n'

describe('LiteCAD brand', () => {
  afterEach(cleanup)

  test('uses the official brand casing in localized home copy', () => {
    expect(i18n.getFixedT('en')('home.body')).toMatch(/^LiteCAD /)
    expect(i18n.getFixedT('zh')('home.body')).toMatch(/^LiteCAD /)
  })

  test('uses the official brand casing in the browser title', () => {
    const indexHTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(indexHTML).toContain('<title>LiteCAD</title>')
  })

  test('uses the official brand casing in application context', () => {
    render(<AppContext.Consumer>{({ appName }) => <span>{appName}</span>}</AppContext.Consumer>)

    expect(screen.getByText('LiteCAD')).toBeTruthy()
  })
})
