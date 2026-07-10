import { expect, test, type Page, type Route } from '@playwright/test'

const projectId = 'project_smoke'
const now = '2026-07-10T00:00:00Z'

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
        thumbnail: { model_count: 0, models: [] },
        created_at: now,
        updated_at: now,
      },
    },
    [`/api/v1/projects/${projectId}/models`]: { models: [] },
    [`/api/v1/projects/${projectId}/agent/messages`]: { messages: [] },
    [`/api/v1/projects/${projectId}/cad-document`]: {
      document: {
        id: 'cad_document_smoke',
        project_id: projectId,
        schema_version: 1,
        revision: 1,
        unit: 'mm',
        nodes: [],
        operations: [],
        history: { head_id: '', can_undo: false, can_redo: false },
        created_at: now,
        updated_at: now,
      },
    },
    [`/api/v1/projects/${projectId}/cad-document/history`]: { entries: [] },
  }
  if (request.method() === 'GET' && pathname in responses) {
    await route.fulfill({ json: responses[pathname] })
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
  const browserErrors = captureBrowserErrors(page)
  await page.route('**/api/v1/**', fulfillAPI)

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByRole('heading', { name: 'Workbench Smoke' })).toBeVisible()
  await expect(page.getByText('Import a CAD model to populate the project tree.')).toBeVisible()

  await page.getByRole('button', { name: 'Operation history' }).click()
  await expect(page.getByRole('dialog', { name: 'Operation history' })).toBeVisible()
  await expect(page.getByText('Edits will appear here after you move, add, or delete model content.')).toBeVisible()

  await page.getByRole('button', { name: 'Toggle Assistant' }).click()
  await expect(page.getByRole('complementary', { name: 'Assistant panel' })).toHaveAttribute('aria-hidden', 'false')
  await expect(page.getByText('0 project sources attached')).toBeVisible()
  await page.getByRole('button', { name: 'Close Assistant' }).click()
  await expect(page.locator('[aria-label="Assistant panel"]')).toHaveAttribute('aria-hidden', 'true')

  expect(browserErrors).toEqual([])
})
