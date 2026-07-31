import { expect, test } from '@playwright/test'

import { captureBrowserErrors, installProjectAPIFixture, projectId } from './fixtures/project-api'

test('captures and reuses immutable subassembly snapshots through preview export reload and history', async ({ page }) => {
  test.slow()
  const browserErrors = captureBrowserErrors(page)
  const fixture = await installProjectAPIFixture(page)
  fixture.seedSubassemblySource()

  await page.goto(`/projects/${projectId}`)
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '2')
  await expect(page.getByTestId('project-subassemblies')).toHaveCount(0)

  await page.getByRole('button', { name: 'Save Drive source for reuse' }).click()
  await page.getByRole('textbox', { name: 'Combination name' }).fill('Drive module')
  await page.getByRole('button', { name: 'Save combination' }).click()
  await expect.poll(() => fixture.state.subassemblyDefinitionCreateCount).toBe(1)
  await page.getByRole('button', { name: 'Saved combinations, 1 combination' }).click()
  await expect(page.getByText('Drive module · 2 models')).toBeVisible()

  await page.getByRole('button', { name: 'Insert a copy of Drive module' }).click()
  await page.getByRole('textbox', { name: 'Copy name' }).fill('Drive A')
  await page.getByRole('button', { name: 'Position (optional)' }).click()
  await page.getByRole('spinbutton', { name: 'X position' }).fill('100')
  await page.getByRole('button', { name: 'Insert copy', exact: true }).click()
  await expect.poll(() => fixture.state.subassemblyInstanceCreateCount).toBe(1)

  await page.getByRole('button', { name: 'Insert a copy of Drive module' }).click()
  await page.getByRole('textbox', { name: 'Copy name' }).fill('Drive B')
  await page.getByRole('button', { name: 'Position (optional)' }).click()
  await page.getByRole('spinbutton', { name: 'X position' }).fill('200')
  await page.getByRole('button', { name: 'Insert copy', exact: true }).click()
  await expect.poll(() => fixture.state.subassemblyInstanceCreateCount).toBe(2)
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '6')

  await page.getByRole('button', { name: 'Export STEP' }).click()
  await expect(page.getByRole('dialog', { name: 'Export STEP' })).toBeVisible()
  await expect(page.getByText('6/6 selected')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Suppress Drive A', exact: true }).click()
  await expect.poll(() => fixture.state.assemblyGroups.find((group) => group.name === 'Drive A')?.suppressed).toBe(true)
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '4')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => fixture.state.undoCount).toBe(1)
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '6')
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect.poll(() => fixture.state.redoCount).toBe(1)
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '4')

  await page.reload()
  await page.getByRole('button', { name: 'Saved combinations, 1 combination' }).click()
  await expect(page.getByText('Drive module · 2 models')).toBeVisible()
  await expect(page.getByText('Drive A', { exact: true })).toBeVisible()
  await expect(page.getByText('Drive B', { exact: true })).toBeVisible()
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '4')
  expect(fixture.state.assemblySubassemblies[0]?.members.map((member) => member.relative_transform.matrix.slice(3, 12).filter((_, index) => index % 4 === 0))).toEqual([
    [0, 0, 0],
    [15, 5, 0],
  ])
  expect(browserErrors).toEqual([])
})
