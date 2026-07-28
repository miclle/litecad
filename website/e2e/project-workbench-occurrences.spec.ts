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

	await page.getByRole('button', { name: 'Create assembly group' }).click()
	await expect.poll(() => fixture.state.assemblyGroupCreateCount).toBe(1)
	await expect(page.getByText('Group 1', { exact: true })).toBeVisible()
	await page.getByRole('button', { name: 'Create subgroup in Group 1' }).click()
	await expect.poll(() => fixture.state.assemblyGroupCreateCount).toBe(2)
	await expect(page.getByTestId('assembly-group-grp_smoke_2').getByText('Group 1 subgroup', { exact: true })).toBeVisible()

	await page.getByRole('combobox', { name: 'Assembly group' }).click()
	await page.getByRole('option', { name: /Group 1 subgroup/ }).click()
	await expect.poll(() => fixture.state.occurrences[0]?.parent_group_id).toBe('grp_smoke_2')
	await page.getByRole('button', { name: 'Suppress Group 1', exact: true }).click()
	await expect.poll(() => fixture.state.assemblyGroups[0]?.suppressed).toBe(true)
	await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')

	await page.getByRole('button', { name: 'Export STEP' }).click()
	await expect(page.getByRole('dialog', { name: 'Export STEP' })).toBeVisible()
	await expect(page.getByText('1/1 selected')).toBeVisible()
	await page.keyboard.press('Escape')

	await page.getByRole('button', { name: 'Undo' }).click()
	await expect.poll(() => fixture.state.undoCount).toBe(1)
	await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '2')
	await page.getByRole('button', { name: 'Redo' }).click()
	await expect.poll(() => fixture.state.redoCount).toBe(1)
	await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')

	await page.reload()
	await expect(page.getByRole('option', { name: /Fixture right/ })).toBeVisible()
	await expect(page.getByTestId('assembly-group-grp_smoke_2').getByText('Group 1 subgroup', { exact: true })).toBeVisible()
	await expect(page.locator('[data-model-preview]')).toHaveAttribute('data-preview-asset-count', '1')
	expect(fixture.state.occurrences[0]?.name).toBe('Fixture right')
	expect(fixture.state.occurrences[0]?.transform.matrix[3]).toBe(24)
	expect(fixture.state.occurrences[0]?.parent_group_id).toBe('grp_smoke_2')
	expect(browserErrors).toEqual([])
})

test('manages an existing position link and propagates driver placement through history', async ({ page }) => {
	test.slow()
	const browserErrors = captureBrowserErrors(page)
	const fixture = await installProjectAPIFixture(page)
	fixture.seedSavedModel()

	await page.goto(`/projects/${projectId}`)
	await page.getByRole('option', { name: /Smoke bracket/ }).click()
	await page.getByRole('button', { name: 'Duplicate occurrence' }).click()
	await expect.poll(() => fixture.state.occurrenceDuplicateCount).toBe(1)
	await expect(page.getByTestId('assembly-constraints')).toHaveCount(0)

	const [driver, follower] = fixture.state.occurrences
	const createResult = await page.evaluate(async ({ expectedRevision, firstOccurrenceID, projectID, secondOccurrenceID }) => {
		const response = await fetch(`/api/v1/projects/${projectID}/cad-document/constraints`, {
			body: JSON.stringify({
				expected_revision: expectedRevision,
				first_anchor: [0, 0, 0],
				first_occurrence_id: firstOccurrenceID,
				kind: 'mate',
				name: 'Point mate 1',
				offset: [10, 0, 0],
				second_anchor: [0, 0, 0],
				second_occurrence_id: secondOccurrenceID,
			}),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
		})
		return { ok: response.ok, status: response.status }
	}, {
		expectedRevision: fixture.state.cadRevision,
		firstOccurrenceID: driver!.id,
		projectID: projectId,
		secondOccurrenceID: follower!.id,
	})
	expect(createResult).toEqual({ ok: true, status: 200 })
	await expect.poll(() => fixture.state.assemblyConstraintCreateCount).toBe(1)
	expect(fixture.state.occurrences[1]?.transform.matrix[3]).toBe(10)
	await page.reload()
	await page.getByRole('button', { name: 'Advanced position links, 1 link' }).click()
	await expect(page.getByText('Smoke bracket copy follows Smoke bracket')).toBeVisible()
	await expect(page.getByText('Connected')).toBeVisible()
	await expect(page.getByText(/residual/i)).toHaveCount(0)

	await page.getByRole('option', { name: /^Smoke bracket$/ }).click()
	const driverX = page.getByLabel('X position for Smoke bracket')
	await driverX.fill('5')
	await driverX.press('Tab')
	await expect.poll(() => fixture.state.transformUpdateCount).toBe(1)
	expect(fixture.state.occurrences[0]?.transform.matrix[3]).toBe(5)
	expect(fixture.state.occurrences[1]?.transform.matrix[3]).toBe(15)

	await page.getByRole('button', { name: 'Undo' }).click()
	await expect.poll(() => fixture.state.undoCount).toBe(1)
	expect(fixture.state.occurrences[0]?.transform.matrix[3]).toBe(0)
	expect(fixture.state.occurrences[1]?.transform.matrix[3]).toBe(10)
	await page.getByRole('button', { name: 'Redo' }).click()
	await expect.poll(() => fixture.state.redoCount).toBe(1)
	expect(fixture.state.occurrences[0]?.transform.matrix[3]).toBe(5)
	expect(fixture.state.occurrences[1]?.transform.matrix[3]).toBe(15)

	await page.reload()
	await page.getByRole('button', { name: 'Advanced position links, 1 link' }).click()
	await expect(page.getByText('Smoke bracket copy follows Smoke bracket')).toBeVisible()
	await page.getByRole('button', { name: 'Remove position link Point mate 1' }).click()
	await expect.poll(() => fixture.state.assemblyConstraintDeleteCount).toBe(1)
	await expect(page.getByTestId('assembly-constraints')).toHaveCount(0)
	expect(browserErrors).toEqual([])
})
