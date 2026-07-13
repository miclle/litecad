import { expect, test } from '@playwright/test'

import { captureBrowserErrors, installProjectAPIFixture, projectId } from './fixtures/project-api'

test('recovers from a transform conflict and supports Undo and Redo', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  const fixture = await installProjectAPIFixture(page)
  fixture.seedTransformModel()
  fixture.state.conflictNextTransform = true

  await page.goto(`/projects/${projectId}`)
  await page.getByRole('option', { name: 'Smoke bracket' }).click()
  const xPosition = page.getByLabel('X position for Smoke bracket')
  await xPosition.fill('12')
  await xPosition.press('Tab')

  await expect(page.getByRole('dialog', { name: 'Operation history' })).toBeVisible()
  expect(fixture.state.transformUpdateCount).toBe(0)
  await page.keyboard.press('Escape')

  await xPosition.fill('12')
  await xPosition.press('Tab')
  await expect.poll(() => fixture.state.transformUpdateCount).toBe(1)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => fixture.state.undoCount).toBe(1)
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled()
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect.poll(() => fixture.state.redoCount).toBe(1)
  await expect(xPosition).toHaveValue('12')

  expect(browserErrors).toEqual(['console: Failed to load resource: the server responded with a status of 409 (Conflict)'])
})
