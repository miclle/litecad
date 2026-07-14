import { expect, test } from '@playwright/test'

import { captureBrowserErrors, installProjectAPIFixture, projectId } from './fixtures/project-api'

test('authors repeated assembly occurrences through reload, history, preview, and export selection', async ({ page }) => {
	test.slow()
	const browserErrors = captureBrowserErrors(page)
	const fixture = await installProjectAPIFixture(page)
	fixture.seedSavedModel()

	await page.goto(`/projects/${projectId}`)
	await page.getByRole('option', { name: /Smoke bracket/ }).click()
	await page.getByRole('button', { name: 'Duplicate occurrence' }).click()
	await expect.poll(() => fixture.state.occurrenceDuplicateCount).toBe(1)
	await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '2')

	await page.getByRole('option', { name: /Smoke bracket copy/ }).click()
	await page.getByRole('button', { name: 'Rename occurrence' }).click()
	const nameInput = page.getByRole('textbox', { name: 'Occurrence name' })
	await nameInput.fill('Fixture right')
	await page.getByRole('button', { name: 'Save occurrence name' }).click()
	await expect.poll(() => fixture.state.occurrenceUpdateCount).toBe(1)
	await expect(page.getByRole('option', { name: /Fixture right/ })).toBeVisible()

	await page.getByRole('button', { name: 'Move occurrence up' }).click()
	await expect.poll(() => fixture.state.occurrenceMoveCount).toBe(1)
	expect(fixture.state.occurrences[0]?.name).toBe('Fixture right')

	const xPosition = page.getByLabel('X position for Fixture right')
	await xPosition.fill('24')
	await xPosition.press('Tab')
	await expect.poll(() => fixture.state.transformUpdateCount).toBe(1)
	expect(fixture.state.occurrences[0]?.transform.matrix[3]).toBe(24)

	await page.getByRole('button', { name: 'Suppress occurrence' }).click()
	await expect.poll(() => fixture.state.occurrences[0]?.suppressed).toBe(true)
	await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')
	await page.getByRole('button', { name: 'Unsuppress occurrence' }).click()
	await expect.poll(() => fixture.state.occurrences[0]?.suppressed).toBe(false)
	await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '2')

	await page.getByRole('button', { name: 'Export STEP' }).click()
	await expect(page.getByRole('dialog', { name: 'Export STEP' })).toBeVisible()
	await expect(page.getByText('2/2 selected')).toBeVisible()
	await page.keyboard.press('Escape')

	await page.getByRole('button', { name: 'Undo' }).click()
	await expect.poll(() => fixture.state.undoCount).toBe(1)
	await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')
	await page.getByRole('button', { name: 'Redo' }).click()
	await expect.poll(() => fixture.state.redoCount).toBe(1)
	await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '2')

	await page.reload()
	await expect(page.getByRole('option', { name: /Fixture right/ })).toBeVisible()
	await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '2')
	expect(fixture.state.occurrences[0]?.name).toBe('Fixture right')
	expect(fixture.state.occurrences[0]?.transform.matrix[3]).toBe(24)
	expect(browserErrors).toEqual([])
})
