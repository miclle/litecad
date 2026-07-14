import { expect, test } from '@playwright/test'

import {
  captureBrowserErrors,
  installProjectAPIFixture,
  projectId,
  smokeFeatureDSLSource,
  sphereXYZThroughHoleFeatureDSLSource,
} from './fixtures/project-api'

test('runs the Assistant draft, save, parameter edit, and reload workflow', async ({ page }) => {
  test.slow()
  const browserErrors = captureBrowserErrors(page)
  const fixture = await installProjectAPIFixture(page)

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByRole('heading', { name: 'Workbench Smoke' })).toBeVisible()

  await page.getByRole('button', { name: 'Toggle Assistant' }).click()
  await expect(page.getByRole('complementary', { name: 'Assistant panel' })).toHaveAttribute('aria-hidden', 'false')
  await expect(page.getByText('0 project sources attached')).toBeVisible()
  await expect(page.getByLabel('Assistant conversation')).toHaveValue('agc_smoke')
  await page.getByLabel('Message Assistant').fill('Inspect smoke project')
  await page.getByRole('button', { name: 'Send Assistant message' }).click()
  await expect(page.getByText('Smoke reply ready.')).toBeVisible()
  await page.getByLabel('Message Assistant').fill('Make a smoke bracket')
  await page.getByRole('button', { name: 'Generate parametric model' }).click()
  await expect(page.getByRole('heading', { name: 'Smoke bracket' })).toBeVisible()
  const generatedInspector = page.getByRole('region', { name: 'Parametric artifact' })
  await expect(page.getByLabel('width parameter')).toBeVisible()
  await expect(generatedInspector.getByText('success')).toBeHidden()
  await expect(generatedInspector.getByText('Generated source')).toBeHidden()
  await expect(generatedInspector.getByText(smokeFeatureDSLSource)).toBeHidden()
  await expect(generatedInspector.getByRole('button', { name: 'Show source' })).toBeHidden()
  await expect(generatedInspector.getByRole('button', { name: 'Hide source' })).toBeHidden()
  const generatedParameterBounds = await page.getByLabel('width parameter').boundingBox()
  const generatedInspectorBounds = await generatedInspector.boundingBox()
  expect(generatedParameterBounds).not.toBeNull()
  expect(generatedInspectorBounds).not.toBeNull()
  expect(generatedParameterBounds!.x + generatedParameterBounds!.width).toBeLessThanOrEqual(
    generatedInspectorBounds!.x + generatedInspectorBounds!.width + 1,
  )
  await expect(page.getByRole('option', { name: 'Smoke bracket' })).toBeVisible()
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')
  expect(fixture.state.artifactUpdateCount).toBe(1)
  expect(fixture.state.featureDSLSourceRequestCount).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Close Assistant' }).click()
  await expect(page.locator('[aria-label="Assistant panel"]')).toHaveAttribute('aria-hidden', 'true')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Workbench Smoke' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Smoke bracket' })).toBeVisible()
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')
  await page.getByRole('option', { name: 'Smoke bracket' }).click()
  await expect(page.getByLabel('width value')).toHaveValue('60')
  const savedModelInspector = page.getByRole('region', { name: 'Parametric artifact' })
  await expect(savedModelInspector.getByRole('button', { name: 'Save parameters' })).toBeHidden()
  const modelParameterUpdatesBefore = fixture.state.modelParameterUpdateCount
  await page.locator('[data-model-preview] canvas').first().evaluate((canvas) => {
    canvas.setAttribute('data-litecad-stable-canvas', 'saved-parameter-edit')
  })
  await page.getByLabel('width value').fill('90')
  await expect(page.getByLabel('width value')).toHaveValue('90')
  await expect.poll(() => fixture.state.modelParameterUpdateCount).toBe(modelParameterUpdatesBefore + 1)
  expect(fixture.state.savedParameterValues).toEqual({ width: 90 })
  await page.getByRole('button', { name: 'Operation history' }).click()
  await expect(page.getByText('Update parameters for smoke-bracket-litecad.lcad.json')).toBeVisible()
  await expect
    .poll(() => page.locator('[data-model-preview] canvas').first().evaluate((canvas) => canvas.getAttribute('data-litecad-stable-canvas')))
    .toBe('saved-parameter-edit')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Workbench Smoke' })).toBeVisible()
  await page.getByRole('option', { name: 'Smoke bracket' }).click()
  await expect(page.getByLabel('width value')).toHaveValue('90')
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')

  expect(browserErrors).toEqual([])
})

test('generates a sphere with X Y Z through holes through the mock provider workflow', async ({ page }) => {
  test.slow()
  const browserErrors = captureBrowserErrors(page)
  const fixture = await installProjectAPIFixture(page)
  fixture.state.parametricArtifactTitle = 'Ball with XYZ through holes'
  fixture.state.parametricArtifactSourceCode = sphereXYZThroughHoleFeatureDSLSource
  fixture.state.savedModelID = 'mdl_sphere_xyz_lcad'
  fixture.state.savedModelFilename = 'ball-xyz-through-holes.lcad.json'

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByRole('heading', { name: 'Workbench Smoke' })).toBeVisible()

  await page.getByRole('button', { name: 'Toggle Assistant' }).click()
  await expect(page.getByText('0 project sources attached')).toBeVisible()
  await page
    .getByLabel('Message Assistant')
    .fill('创建一个直径 30mm 的球体，xyz 轴每根轴线上都有一个直径 5mm 的通孔')
  await page.getByRole('button', { name: 'Generate parametric model' }).click()

  await expect(page.getByRole('heading', { name: 'Ball with XYZ through holes' })).toBeVisible()
  await expect(page.getByLabel('SPHERE_DIAMETER parameter')).toBeVisible()
  await expect(page.getByLabel('HOLE_DIAMETER parameter')).toBeVisible()
  await expect(page.getByRole('option', { name: 'Ball with XYZ through holes' })).toBeVisible()
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')
  await expect(page.locator('[data-model-preview] canvas').first()).toBeVisible()
  await expect.poll(() => fixture.state.artifactUpdateCount).toBe(1)
  await expect.poll(() => fixture.state.featureDSLSourceRequestCount).toBeGreaterThan(0)
  expect(fixture.state.models).toHaveLength(1)
  expect(fixture.state.models[0]).toMatchObject({
    id: 'mdl_sphere_xyz_lcad',
    original_filename: 'ball-xyz-through-holes.lcad.json',
    format: 'lcad',
    metadata: {
      product_names: ['Ball with XYZ through holes'],
      entity_count: 4,
    },
  })

  expect(browserErrors).toEqual([])
})

test('shows Assistant parametric progress and failure recovery guidance', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  const fixture = await installProjectAPIFixture(page)
  fixture.state.parametricRunDelayMs = 250
  fixture.state.parametricRunErrorMessage = 'Provider returned invalid LiteCAD feature DSL for browser smoke.'

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByRole('heading', { name: 'Workbench Smoke' })).toBeVisible()

  await page.getByRole('button', { name: 'Toggle Assistant' }).click()
  await expect(page.getByLabel('Assistant conversation')).toHaveValue('agc_smoke')
  await page.getByLabel('Message Assistant').fill('Make a smoke bracket')
  await page.getByRole('button', { name: 'Generate parametric model' }).click()

  await expect(page.getByRole('status').getByText('Generating parametric model')).toBeVisible()
  await expect(page.getByText('Attempt 1 is running.')).toBeVisible()
  await expect(page.getByText('Prompt: Make a smoke bracket')).toBeVisible()
  await expect(page.getByText('Provider response and validation')).toBeVisible()

  const assistantForm = page.locator('form')
  await expect(page.getByText('Generation needs attention')).toBeVisible()
  await expect(
    assistantForm.getByText('The AI provider returned a model draft LiteCAD could not validate. Retry generation with a more specific prompt.'),
  ).toBeVisible()
  await expect(
    assistantForm.getByText(
      'No canvas changes were made. Retry sends the same prompt again; edit the prompt below if the request needs more detail.',
    ),
  ).toBeVisible()
  await expect(assistantForm.getByText('Last prompt:')).toBeVisible()
  await expect(assistantForm.getByRole('button', { name: 'Retry generation' })).toBeVisible()

  expect(browserErrors.filter((error) => !error.includes('status of 422'))).toEqual([])
})
