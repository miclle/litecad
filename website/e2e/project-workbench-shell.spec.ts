import { expect, test } from '@playwright/test'

import { captureBrowserErrors, installProjectAPIFixture, projectId } from './fixtures/project-api'

test('opens the project workbench shell and History without browser errors', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await installProjectAPIFixture(page)

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByRole('heading', { name: 'Workbench Smoke' })).toBeVisible()
  await expect(page.getByText('Import a CAD model to populate the project tree.')).toBeVisible()
  const projectLabel = page.getByText('Project', { exact: true })
  await expect(projectLabel).toBeHidden()
  const collapseButton = page.getByRole('button', { name: 'Collapse left panel' })
  const panelPadding = await collapseButton.evaluate((button) => {
    const panel = button.closest('aside')
    if (!panel) return null
    const styles = getComputedStyle(panel)
    return [styles.paddingTop, styles.paddingRight, styles.paddingBottom, styles.paddingLeft]
  })
  expect(panelPadding).toEqual(['12px', '12px', '12px', '12px'])
  const collapseButtonBounds = await collapseButton.boundingBox()
  const modelLabelBounds = await page.getByText('Model', { exact: true }).boundingBox()
  expect(collapseButtonBounds).not.toBeNull()
  expect(modelLabelBounds).not.toBeNull()
  const collapseButtonCenter = collapseButtonBounds!.y + collapseButtonBounds!.height / 2
  const modelLabelCenter = modelLabelBounds!.y + modelLabelBounds!.height / 2
  expect(Math.abs(modelLabelCenter - collapseButtonCenter)).toBeLessThanOrEqual(4)
  const projectDescription = page.getByText('Deterministic browser verification project.')
  await expect(projectDescription).toBeHidden()
  await page.getByRole('button', { name: 'Project info' }).click()
  await expect(projectLabel).toBeVisible()
  await expect(projectDescription).toBeVisible()
  await page.getByRole('button', { name: 'Project info' }).click()

  await page.getByRole('button', { name: 'Operation history' }).click()
  await expect(page.getByRole('dialog', { name: 'Operation history' })).toBeVisible()
  await expect(page.getByText('Edits will appear here after you move, change parameters, add, or delete model content.')).toBeVisible()
  await page.keyboard.press('Escape')

  expect(browserErrors).toEqual([])
})

test('keeps the measurement panel clear of view orientation controls and persists inspection records', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  const fixture = await installProjectAPIFixture(page)
  fixture.seedSavedModel()

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByRole('heading', { name: 'Workbench Smoke' })).toBeVisible()
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')
  await page.getByRole('button', { name: 'Measure', exact: true }).click()
  await expect(page.getByLabel('Measurement summary')).toBeVisible()

  const orientationBounds = await page.getByLabel('View orientation controls').boundingBox()
  const measurementBounds = await page.getByLabel('Measurement summary').boundingBox()
  expect(orientationBounds).not.toBeNull()
  expect(measurementBounds).not.toBeNull()
  expect(measurementBounds!.y).toBeGreaterThanOrEqual(orientationBounds!.y + orientationBounds!.height)

  await expect(page.getByText('Inspection records')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save measurement' })).toBeEnabled()
  await page.getByRole('button', { name: 'Save measurement' }).click()
  await page.getByRole('button', { name: 'Section', exact: true }).click()
  await page.getByRole('button', { name: 'Save section' }).click()
  await expect.poll(() => fixture.state.inspectionRecords.length).toBe(2)

  await page.reload()
  await expect(page.getByText('Visible bounds')).toBeVisible()
  await expect(page.getByText('Center X section')).toBeVisible()
  await page.getByRole('button', { name: 'Restore Center X section' }).click()
  await expect(page.getByRole('button', { name: 'Section', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Delete Visible bounds' }).click()
  await expect.poll(() => fixture.state.inspectionRecords.map((record) => record.name)).toEqual(['Center X section'])

  expect(browserErrors).toEqual([])
})

test('renders edge overlays when Edges is enabled', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  const fixture = await installProjectAPIFixture(page)
  fixture.seedSavedModel()

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByRole('heading', { name: 'Workbench Smoke' })).toBeVisible()
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')
  const previewCanvas = page.locator('[data-model-preview] canvas').first()
  await expect(previewCanvas).toBeVisible()
  await page.waitForTimeout(250)
  const beforeEdges = await previewCanvas.screenshot()

  await page.getByRole('button', { name: 'Edges' }).click()
  await expect(page.getByRole('button', { name: 'Edges' })).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(250)
  const afterEdges = await previewCanvas.screenshot()

  expect(afterEdges.equals(beforeEdges)).toBe(false)
  expect(browserErrors).toEqual([])
})
