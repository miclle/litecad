import { expect, test, type Page, type Route } from '@playwright/test'

const projectId = 'project_smoke'
const now = '2026-07-10T00:00:00Z'
let smokeMessages: unknown[] = []
let smokeModels: unknown[] = []
let smokeFeatureDSLSourceRequestCount = 0
let smokeArtifactCompileStatus = 'pending'
let smokeArtifactUpdateCount = 0
let smokeModelParameterUpdateCount = 0
let smokeSavedParameterValues: Record<string, unknown> = {}
const smokeFeatureDSLSource = JSON.stringify({
  version: 1,
  unit: 'millimetre',
  parameters: {
    width: { type: 'number', default: 60, min: 20, max: 120, step: 5 },
  },
  features: [{ id: 'base', type: 'box', origin: [0, 0, 0], size: ['width', 24, 8] }],
})
const smokeParametricArtifact = {
  id: 'pma_smoke',
  project_id: projectId,
  conversation_id: 'agc_smoke',
  message_id: 'agm_smoke_parametric',
  title: 'Smoke bracket',
  source_kind: 'litecad-feature-dsl',
  source_code: smokeFeatureDSLSource,
  parameter_values: {},
  compile_status: 'pending',
  compile_error: '',
  preview_model_id: '',
  created_at: now,
  updated_at: now,
}
const baseSmokeSavedModel = {
  id: 'mdl_smoke_lcad',
  project_id: projectId,
  original_filename: 'smoke-bracket-litecad.lcad.json',
  format: 'lcad',
  content_type: 'application/json',
  byte_size: smokeFeatureDSLSource.length,
  parse_status: 'parsed',
  parse_error: '',
  metadata: {
    asset_type: 'lcad',
    source_kind: 'litecad-feature-dsl',
    version: '1',
    schema: 'litecad-feature-dsl',
    product_names: ['Smoke bracket'],
    components: [],
    length_unit: 'millimetre',
    entity_count: 1,
    parameter_count: 1,
    parameter_values: {},
    compile_summary: 'LiteCAD feature DSL source',
    representation_count: 1,
    triangle_count: 12,
  },
  created_at: now,
  updated_at: now,
}

function smokeSavedModel() {
  return {
    ...baseSmokeSavedModel,
    metadata: {
      ...baseSmokeSavedModel.metadata,
      parameter_values: smokeSavedParameterValues,
    },
  }
}

function smokeCADDocument() {
  return {
    id: 'cad_document_smoke',
    project_id: projectId,
    schema_version: 1,
    revision: smokeModels.length > 0 ? 2 : 1,
    unit: 'mm',
    nodes:
      smokeModels.length > 0
        ? [
            {
              id: 'node_mdl_smoke_lcad',
              model_id: 'mdl_smoke_lcad',
              source_model_id: '',
              parent_node_id: '',
              name: 'Smoke bracket',
              source_format: 'lcad',
              transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
            },
          ]
        : [],
    operations: [],
    history: { head_id: '', can_undo: false, can_redo: false },
    created_at: now,
    updated_at: now,
  }
}

async function fulfillAPI(route: Route) {
  const request = route.request()
  const pathname = new URL(request.url()).pathname
  const responses: Record<string, unknown> = {
    '/api/v1/auth/me': { user: { id: 'user_smoke', name: 'Smoke User', email: 'smoke@example.com' } },
    [`/api/v1/projects/${projectId}`]: {
      project: {
        id: projectId,
        name: 'Workbench Smoke',
        description: 'Deterministic browser verification project.',
        thumbnail: { model_count: smokeModels.length, models: smokeModels },
        created_at: now,
        updated_at: now,
      },
    },
    [`/api/v1/projects/${projectId}/models`]: { models: smokeModels },
    [`/api/v1/projects/${projectId}/agent/conversations`]: {
      conversations: [{ id: 'agc_smoke', project_id: projectId, title: 'Smoke chat', created_at: now, updated_at: now }],
    },
    [`/api/v1/projects/${projectId}/agent/conversations/agc_smoke/messages`]: { messages: smokeMessages },
    [`/api/v1/projects/${projectId}/parametric-artifacts`]: { artifacts: [] },
    [`/api/v1/projects/${projectId}/cad-document`]: { document: smokeCADDocument() },
    [`/api/v1/projects/${projectId}/cad-document/history`]: { entries: [] },
  }
  if (request.method() === 'GET' && pathname in responses) {
    await route.fulfill({ json: responses[pathname] })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/agent/conversations/agc_smoke/messages`) {
    const requestBody = request.postDataJSON() as { messages?: Array<{ role: 'assistant' | 'user'; body: string }> }
    const userMessageBody = requestBody.messages?.at(-1)?.body ?? 'Inspect smoke project'
    smokeMessages = [
      {
        id: 'agm_smoke_user',
        project_id: projectId,
        conversation_id: 'agc_smoke',
        role: 'user',
        body: userMessageBody,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'agm_smoke',
        project_id: projectId,
        conversation_id: 'agc_smoke',
        role: 'assistant',
        body: 'Smoke reply ready.',
        created_at: now,
        updated_at: now,
      },
    ]
    await route.fulfill({
      json: {
        message: smokeMessages[1],
      },
    })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/agent/conversations/agc_smoke/parametric-runs`) {
    const requestBody = request.postDataJSON() as { message?: string }
    const assistantMessage = {
      id: 'agm_smoke_parametric',
      project_id: projectId,
      conversation_id: 'agc_smoke',
      role: 'assistant',
      body: JSON.stringify({
        tool: 'build_parametric_model',
        input: {
          title: smokeParametricArtifact.title,
          version: 'v1',
          source_kind: 'litecad-feature-dsl',
          code: smokeParametricArtifact.source_code,
        },
      }),
      parts: [
        {
          type: 'artifact',
          artifact_id: smokeParametricArtifact.id,
        },
      ],
      created_at: now,
      updated_at: now,
    }
    smokeMessages = [
      ...smokeMessages,
      {
        id: 'agm_smoke_parametric_user',
        project_id: projectId,
        conversation_id: 'agc_smoke',
        role: 'user',
        body: requestBody.message ?? 'Make a smoke bracket',
        created_at: now,
        updated_at: now,
      },
      assistantMessage,
    ]
    await route.fulfill({
      json: {
        message: assistantMessage,
        artifact: { ...smokeParametricArtifact, compile_status: smokeArtifactCompileStatus },
      },
    })
    return
  }
  if (request.method() === 'PATCH' && pathname === `/api/v1/projects/${projectId}/parametric-artifacts/${smokeParametricArtifact.id}`) {
    const requestBody = request.postDataJSON() as { compile_status?: string }
    smokeArtifactCompileStatus = requestBody.compile_status ?? smokeArtifactCompileStatus
    smokeArtifactUpdateCount += 1
    await route.fulfill({ json: { artifact: { ...smokeParametricArtifact, compile_status: smokeArtifactCompileStatus } } })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/parametric-artifacts/${smokeParametricArtifact.id}/save-model`) {
    if (smokeArtifactCompileStatus !== 'success') {
      await route.fulfill({ json: { message: 'artifact was not compiled before save' }, status: 400 })
      return
    }
    smokeModels = [smokeSavedModel()]
    await route.fulfill({ json: { model: smokeSavedModel() } })
    return
  }
  if (request.method() === 'POST' && pathname === `/api/v1/projects/${projectId}/thumbnail`) {
    await route.fulfill({
      json: {
        snapshot: {
          url: `/api/v1/projects/${projectId}/thumbnail/smoke.webp`,
          status: 'ready',
          revision: smokeModels.length > 0 ? 2 : 1,
          width: 320,
          height: 180,
          updated_at: now,
        },
      },
    })
    return
  }
  if (request.method() === 'PATCH' && pathname === `/api/v1/projects/${projectId}/models/${baseSmokeSavedModel.id}/parametric-parameters`) {
    const requestBody = request.postDataJSON() as { parameter_values?: Record<string, unknown> }
    smokeSavedParameterValues = requestBody.parameter_values ?? {}
    smokeModelParameterUpdateCount += 1
    smokeModels = [smokeSavedModel()]
    await route.fulfill({ json: { model: smokeSavedModel() } })
    return
  }
  if (request.method() === 'GET' && pathname === `/api/v1/projects/${projectId}/models/${baseSmokeSavedModel.id}/source`) {
    smokeFeatureDSLSourceRequestCount += 1
    await route.fulfill({
      body: smokeFeatureDSLSource,
      contentType: 'application/json',
    })
    return
  }
  await route.fulfill({ json: { message: `Unhandled smoke request: ${request.method()} ${pathname}` }, status: 500 })
}

function captureBrowserErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`)
    }
  })
  return errors
}

test('opens the project workbench, History, and Assistant without browser errors', async ({ page }) => {
  smokeMessages = []
  smokeModels = []
  smokeFeatureDSLSourceRequestCount = 0
  smokeArtifactCompileStatus = 'pending'
  smokeArtifactUpdateCount = 0
  smokeModelParameterUpdateCount = 0
  smokeSavedParameterValues = {}
  const browserErrors = captureBrowserErrors(page)
  await page.route('**/api/v1/**', fulfillAPI)

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
  await expect(page.getByText('Edits will appear here after you move, add, or delete model content.')).toBeVisible()

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
  await expect(page.getByLabel('width parameter')).toBeVisible()
  await expect(page.getByText('success')).toBeVisible()
  const generatedParameterBounds = await page.getByLabel('width parameter').boundingBox()
  const generatedInspectorBounds = await page.getByRole('region', { name: 'Parametric artifact' }).boundingBox()
  expect(generatedParameterBounds).not.toBeNull()
  expect(generatedInspectorBounds).not.toBeNull()
  expect(generatedParameterBounds!.x + generatedParameterBounds!.width).toBeLessThanOrEqual(
    generatedInspectorBounds!.x + generatedInspectorBounds!.width + 1,
  )
  await expect(page.getByRole('option', { name: 'Smoke bracket' })).toBeVisible()
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')
  expect(smokeArtifactUpdateCount).toBe(1)
  expect(smokeFeatureDSLSourceRequestCount).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Close Assistant' }).click()
  await expect(page.locator('[aria-label="Assistant panel"]')).toHaveAttribute('aria-hidden', 'true')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Workbench Smoke' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Smoke bracket' })).toBeVisible()
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')
  await page.getByRole('option', { name: 'Smoke bracket' }).click()
  await expect(page.getByLabel('width value')).toHaveValue('60')
  await page.getByLabel('width value').fill('90')
  const sourceRequestsBeforeParameterSave = smokeFeatureDSLSourceRequestCount
  await page.getByRole('button', { name: 'Save parameters' }).click()
  await expect(page.getByLabel('width value')).toHaveValue('90')
  await expect.poll(() => smokeModelParameterUpdateCount).toBe(1)
  await expect.poll(() => smokeFeatureDSLSourceRequestCount).toBeGreaterThan(sourceRequestsBeforeParameterSave)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Workbench Smoke' })).toBeVisible()
  await page.getByRole('option', { name: 'Smoke bracket' }).click()
  await expect(page.getByLabel('width value')).toHaveValue('90')
  await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')

  expect(browserErrors).toEqual([])
})
