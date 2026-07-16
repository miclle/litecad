import { expect, test } from '@playwright/test'

import { captureBrowserErrors, installProjectAPIFixture, projectId } from './fixtures/project-api'

test('opens the project workbench shell and History without browser errors', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await installProjectAPIFixture(page)

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByRole('heading', { name: 'Workbench Smoke' })).toBeVisible()
  await expect(page.getByText('Import a CAD model to populate the project tree.')).toBeVisible()
  const cadToolbar = page.getByRole('toolbar', { name: 'CAD tools' })
  await expect(cadToolbar).toBeVisible()
  expect(await cadToolbar.evaluate((toolbar) => getComputedStyle(toolbar).overflowX)).toBe('auto')
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

  await page.getByRole('button', { name: 'Toggle Assistant' }).click()
  await expect(page.getByRole('complementary', { name: 'Assistant panel' })).toHaveAttribute('aria-hidden', 'false')
  await expect.poll(async () => (await cadToolbar.locator('xpath=ancestor::main[1]').boundingBox())?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(861)
  const leftPanel = collapseButton.locator('xpath=ancestor::aside')
  await expect.poll(async () => {
    const [toolbarBounds, leftPanelBounds] = await Promise.all([cadToolbar.boundingBox(), leftPanel.boundingBox()])
    return Boolean(toolbarBounds && leftPanelBounds && toolbarBounds.x >= leftPanelBounds.x + leftPanelBounds.width)
  }).toBe(true)
  await page.getByRole('button', { name: 'Close Assistant' }).click()
  await expect(page.getByRole('complementary', { name: 'Assistant panel' })).toBeHidden()
  await expect.poll(async () => (await cadToolbar.locator('xpath=ancestor::main[1]').boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(1279)

  await page.setViewportSize({ width: 480, height: 720 })
  const compactToolbarLayout = await cadToolbar.evaluate((toolbar) => {
    const bounds = toolbar.getBoundingClientRect()
    return { clientWidth: toolbar.clientWidth, left: bounds.left, right: bounds.right, scrollWidth: toolbar.scrollWidth }
  })
  expect(compactToolbarLayout.scrollWidth).toBeGreaterThan(compactToolbarLayout.clientWidth)
  expect(compactToolbarLayout.left).toBeGreaterThanOrEqual(0)
  expect(compactToolbarLayout.right).toBeLessThanOrEqual(480)

  expect(browserErrors).toEqual([])
})

test('persists derived measurements and browser-kernel section geometry', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  const fixture = await installProjectAPIFixture(page)
  fixture.seedSavedModel()

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByRole('heading', { name: 'Workbench Smoke' })).toBeVisible()
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')
  await page.getByRole('button', { name: 'Measure', exact: true }).click()
  await expect(page.getByLabel('Measurement summary')).toBeVisible()
  await expect(page.getByText('Diagonal', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Section', exact: true }).click()

  const orientationBounds = await page.getByLabel('View orientation controls').boundingBox()
  const measurementBounds = await page.getByLabel('Measurement summary').boundingBox()
  expect(orientationBounds).not.toBeNull()
  expect(measurementBounds).not.toBeNull()
  expect(measurementBounds!.y).toBeGreaterThanOrEqual(orientationBounds!.y + orientationBounds!.height)

  await expect(page.getByRole('dialog', { name: 'Measurements and analysis' })).toBeHidden()
  const analysisRecordsButton = page.getByRole('button', { name: /^Analysis \d+$/ })
  await expect(analysisRecordsButton).toHaveText('Analysis 0')
  await analysisRecordsButton.click()
  const analysisDialog = page.getByRole('dialog', { name: 'Measurements and analysis' })
  await expect(analysisDialog).toBeVisible()
  const analysisBounds = await analysisDialog.boundingBox()
  const triggerBounds = await analysisRecordsButton.boundingBox()
  expect(analysisBounds).not.toBeNull()
  expect(triggerBounds).not.toBeNull()
  expect(analysisBounds!.y + analysisBounds!.height).toBeLessThanOrEqual(triggerBounds!.y)
  await expect(page.getByRole('button', { name: 'Save dimensions' })).toBeEnabled()
  await page.getByRole('button', { name: 'Save dimensions' }).click()
  await expect.poll(() => fixture.state.inspectionRecords.length).toBe(1)
  await expect(page.getByRole('button', { name: 'Calculate geometry properties' })).toBeEnabled()
  await page.getByRole('button', { name: 'Calculate geometry properties' }).click()
  await expect.poll(() => fixture.state.inspectionRecords.length).toBe(2)
  await expect(page.getByRole('button', { name: 'Generate section geometry' })).toBeEnabled()
  await page.getByRole('button', { name: 'Generate section geometry' }).click()
  await expect.poll(() => fixture.state.sectionArtifacts.length, { timeout: 30_000 }).toBe(1)
  await expect(analysisRecordsButton).toHaveText('Analysis 3')
  const desktopViewport = page.viewportSize()
  await page.setViewportSize({ width: 480, height: 400 })
  await expect(analysisDialog).toBeVisible()
  await expect.poll(async () => {
    const bounds = await analysisDialog.boundingBox()
    return Boolean(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 400)
  }).toBe(true)
  const compactAnalysisBounds = await analysisDialog.boundingBox()
  expect(compactAnalysisBounds).not.toBeNull()
  expect(compactAnalysisBounds!.y).toBeGreaterThanOrEqual(0)
  expect(compactAnalysisBounds!.y + compactAnalysisBounds!.height).toBeLessThanOrEqual(400)
  await expect(page.getByRole('button', { name: 'Save dimensions' })).toBeVisible()
  if (desktopViewport) {
    await page.setViewportSize(desktopViewport)
  }
  const previewMeasurement = fixture.state.inspectionRecords.find((record) => record.measurement?.derivation === 'preview-visible-aabb')
  const topologyMeasurement = fixture.state.inspectionRecords.find((record) => record.measurement?.derivation === 'occt-brep-properties')
  expect(previewMeasurement?.measurement?.diagonal).toBeGreaterThan(0)
  expect(topologyMeasurement?.measurement?.topology?.totals).toMatchObject({ volume: 11520, surface_area: 4224, edge_length: 368, face_count: 6, edge_count: 12 })
  expect(topologyMeasurement?.measurement?.topology?.targets[0]?.references).toHaveLength(18)
  expect(fixture.state.sectionArtifacts[0]).toMatchObject({ status: 'ready', edge_count: 4, target_count: 1, generation: 1, is_latest: true })
  expect(fixture.state.sectionArtifacts[0]?.step_text).toContain('END-ISO-10303-21')

  fixture.state.currentModelRevisionID = 'mvr_smoke_2'
  fixture.state.modelRevisionSequence = 2
  fixture.state.cadRevision += 1
  await page.reload()
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1', { timeout: 30_000 })
  await expect(page.getByRole('dialog', { name: 'Measurements and analysis' })).toBeHidden()
  await page.getByRole('button', { name: /^Analysis \d+$/ }).click()
  await expect(page.getByText('Overall dimensions')).toBeVisible()
  await expect(page.getByText('Earlier result', { exact: false }).first()).toBeVisible()
  const sectionFilename = fixture.state.sectionArtifacts[0]?.filename ?? ''
  await expect(page.getByText(sectionFilename)).toBeVisible()
  await expect(page.getByText('Generation 1 · Stale')).toBeVisible()
  await page.getByRole('button', { name: new RegExp(`^Regenerate ${sectionFilename}, generation 1, saved `) }).click()
  await expect.poll(() => fixture.state.sectionArtifacts.length, { timeout: 30_000 }).toBe(2)
  expect(fixture.state.sectionArtifacts[0]).toMatchObject({ association_id: fixture.state.sectionArtifacts[1]?.association_id, generation: 2, is_latest: true, supersedes_artifact_id: fixture.state.sectionArtifacts[1]?.id })
  expect(fixture.state.sectionArtifacts[1]?.is_latest).toBe(false)
  const currentSectionFilename = fixture.state.sectionArtifacts[0]?.filename ?? ''
  await expect(page.getByText('Generation 2 · Current')).toBeVisible()
  await expect(page.getByText('Generation 1 · Superseded')).toBeVisible()
  await page.getByRole('button', { name: new RegExp(`^Restore ${currentSectionFilename}, generation 2, saved `) }).click()
  await expect(page.getByRole('button', { name: 'Section', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: new RegExp(`^Download ${currentSectionFilename}, generation 2, saved `) }).click()
  expect((await downloadPromise).suggestedFilename()).toBe(currentSectionFilename)
  await page.getByRole('button', { name: /^Delete Overall dimensions,/ }).click()
  await page.getByRole('button', { name: /^Delete Geometry properties,/ }).click()
  await page.getByRole('button', { name: new RegExp(`^Delete ${currentSectionFilename}, generation 2, saved `) }).click()
  await expect.poll(() => fixture.state.sectionArtifacts.length).toBe(1)
  await expect.poll(() => fixture.state.inspectionRecords).toEqual([])

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
