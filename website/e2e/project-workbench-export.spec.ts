import { expect, test } from '@playwright/test'

import { captureBrowserErrors, installProjectAPIFixture, projectId } from './fixtures/project-api'

test('exports a selected LiteCAD model as merged STEP', async ({ page }) => {
  test.slow()
  const browserErrors = captureBrowserErrors(page)
  const fixture = await installProjectAPIFixture(page)
  fixture.seedSavedModel()

  await page.goto(`/projects/${projectId}`)
	const exportStepButton = page.getByRole('button', { name: 'Export STEP' })
	await expect(exportStepButton).toBeEnabled({ timeout: 30_000 })
	const assemblyRoot = page.getByTestId('assembly-root')
	await expect(assemblyRoot).toContainText('Workbench Smoke')
  await expect(page.getByRole('option', { name: 'Smoke bracket' })).toBeVisible()
	const desktopAssemblyBounds = await assemblyRoot.boundingBox()
	expect(desktopAssemblyBounds).not.toBeNull()
	expect((desktopAssemblyBounds?.x ?? 0) + (desktopAssemblyBounds?.width ?? 0)).toBeLessThanOrEqual(1280)

	await page.setViewportSize({ width: 1024, height: 768 })
	await expect(assemblyRoot).toBeVisible()
	const narrowAssemblyBounds = await assemblyRoot.boundingBox()
	expect(narrowAssemblyBounds).not.toBeNull()
	expect(narrowAssemblyBounds?.x ?? -1).toBeGreaterThanOrEqual(0)
	expect((narrowAssemblyBounds?.x ?? 0) + (narrowAssemblyBounds?.width ?? 0)).toBeLessThanOrEqual(1024)
	await exportStepButton.click()
	const exportDialog = page.getByRole('dialog', { name: 'Export STEP' })
	await expect(exportDialog).toBeVisible()
	const dialogBounds = await exportDialog.boundingBox()
	expect(dialogBounds).not.toBeNull()
	expect(dialogBounds?.x ?? -1).toBeGreaterThanOrEqual(0)
	expect((dialogBounds?.x ?? 0) + (dialogBounds?.width ?? 0)).toBeLessThanOrEqual(1024)
  await expect(page.getByText('1/1 selected')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Merged STEP' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe('Workbench Smoke-litecad-assembly-r2.step')
  await expect.poll(() => fixture.state.exportArtifacts.length).toBe(1)

  await page.reload()
  await expect(exportStepButton).toBeEnabled({ timeout: 30_000 })
  await expect(assemblyRoot).toContainText('Workbench Smoke')
  await exportStepButton.click()
  await expect(page.getByText('Export history')).toBeVisible()
  await expect(page.getByText('Workbench Smoke-litecad-assembly-r2.step')).toBeVisible()

  const historyDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Workbench Smoke-litecad-assembly-r2.step' }).click()
  const historyDownload = await historyDownloadPromise

  expect(historyDownload.suggestedFilename()).toBe('Workbench Smoke-litecad-assembly-r2.step')
  expect(browserErrors).toEqual([])
})
