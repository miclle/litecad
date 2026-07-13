import { expect, test } from '@playwright/test'

import { installProjectAPIFixture } from './project-api'

test('fixture state can be mutated inside one test', async ({ page }) => {
  const fixture = await installProjectAPIFixture(page)
  fixture.state.savedParameterValues = { width: 90 }
  fixture.state.historyEntries = [{ id: 'history_one' }]

  expect(fixture.state.savedParameterValues).toEqual({ width: 90 })
  expect(fixture.state.historyEntries).toHaveLength(1)
})

test('fixture state starts clean for the next test', async ({ page }) => {
  const fixture = await installProjectAPIFixture(page)

  expect(fixture.state.savedParameterValues).toEqual({})
  expect(fixture.state.historyEntries).toEqual([])
  expect(fixture.state.transformUpdateCount).toBe(0)
})
