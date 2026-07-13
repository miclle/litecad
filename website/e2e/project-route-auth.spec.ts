import { expect, test } from '@playwright/test'

import { captureBrowserErrors } from './fixtures/project-api'

test('shows a deliberate sign-in prompt for signed-out project routes', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await page.route('**/api/v1/**', (route) => {
    route.fulfill({ json: { message: `Unexpected signed-out request: ${route.request().method()} ${route.request().url()}` }, status: 500 })
  })
  await page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({ json: { message: 'unauthorized' }, status: 401 })
  })

  await page.goto('/projects')

  await expect(page.getByRole('heading', { name: 'Sign in to open projects.' })).toBeVisible()
  await expect(page.getByText('Project files, previews, and CAD Agent conversations are scoped to your LiteCAD account.')).toBeVisible()
  await expect(page.getByText('Start a project library')).toBeHidden()

  await page.getByRole('link', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Return to your LiteCAD workspace.' })).toBeVisible()
  expect(browserErrors.filter((error) => !error.includes('status of 401'))).toEqual([])
})
