import { expect, test } from '@playwright/test'

import { captureBrowserErrors, installProjectAPIFixture, projectId } from './fixtures/project-api'

test('imports a project-owned CAD source into the model tree', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  const fixture = await installProjectAPIFixture(page)

  await page.goto(`/projects/${projectId}`)
  await page.locator('input[type="file"]').setInputFiles({
    name: 'uploaded-smoke.stl',
    mimeType: 'model/stl',
    buffer: Buffer.from('solid smoke\nendsolid smoke\n'),
  })

  await expect.poll(() => fixture.state.uploadCount).toBe(1)
  await expect(page.getByRole('option', { name: 'Uploaded smoke' })).toBeVisible()
  expect(browserErrors).toEqual([])
})
