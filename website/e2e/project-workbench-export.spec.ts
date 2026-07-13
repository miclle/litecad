import { expect, test } from '@playwright/test'

import { captureBrowserErrors, installProjectAPIFixture, projectId } from './fixtures/project-api'

test('exports a selected LiteCAD model as merged STEP', async ({ page }) => {
  test.slow()
  const browserErrors = captureBrowserErrors(page)
  const fixture = await installProjectAPIFixture(page)
  fixture.seedSavedModel()

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByRole('option', { name: 'Smoke bracket' })).toBeVisible()
  await page.getByRole('button', { name: 'Export STEP' }).click()
  await expect(page.getByRole('dialog', { name: 'Export STEP' })).toBeVisible()
  await expect(page.getByText('1/1 selected')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Merged STEP' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe('Workbench Smoke-litecad-assembly-r2.step')
  expect(browserErrors).toEqual([])
})
