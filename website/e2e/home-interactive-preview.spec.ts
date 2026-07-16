import { expect, test } from '@playwright/test'

import { captureBrowserErrors } from './fixtures/project-api'

test.use({ reducedMotion: 'reduce' })

test('renders and rotates the interactive home mechanical model', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { user: { id: 'user_home', name: 'Home User', email: 'home@example.com' } } }))
  await page.route('**/api/v1/studio/status', (route) => route.fulfill({ json: { name: 'LiteCAD', status: 'ready', summary: 'Ready', capabilities: [] } }))
  await page.addInitScript(() => {
    window.localStorage.setItem('litecad:language', 'en')
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window)
    const instrumentedWindow = window as typeof window & { __homeRafCount?: number }
    instrumentedWindow.__homeRafCount = 0
    window.requestAnimationFrame = (callback) =>
      nativeRequestAnimationFrame((time) => {
        instrumentedWindow.__homeRafCount = (instrumentedWindow.__homeRafCount ?? 0) + 1
        callback(time)
      })
  })

  await page.goto('/')

  const preview = page.locator('[data-home-model-preview]')
  const canvas = preview.locator('canvas[role="img"]')
  await expect(preview).toBeVisible({ timeout: 30_000 })
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  await expect(canvas).toHaveAttribute('aria-label', 'Interactive 3D mechanical flange preview')
  const previewSurface = preview.locator('..')
  await expect(previewSurface).toHaveCSS('background-color', 'rgb(248, 250, 252)')
  expect(
    await previewSurface.evaluate((element) =>
      [...element.children].some((child) => getComputedStyle(child).backgroundImage.includes('linear-gradient')),
    ),
  ).toBe(false)
  expect(
    await previewSurface.evaluate((element) =>
      [...element.children].some((child) => getComputedStyle(child).borderStyle === 'dashed'),
    ),
  ).toBe(false)
  await expect(page.getByText('Interactive 3D sample')).toBeVisible()
  await expect(preview).toHaveAttribute('data-interacted', 'false')
  const orientationControls = page.getByLabel('View orientation controls')
  const viewCube = orientationControls.getByLabel('View cube')
  await expect(orientationControls).toBeVisible()
  await expect(viewCube).toBeVisible()

  await page.evaluate(() => {
    const instrumentedWindow = window as typeof window & {
      __homeOrientationEvents?: Array<{ at: number; detail: unknown }>
    }
    instrumentedWindow.__homeOrientationEvents = []
    window.addEventListener('litecad:view-orientation-change', (event) => {
      instrumentedWindow.__homeOrientationEvents?.push({
        at: performance.now(),
        detail: (event as CustomEvent).detail,
      })
    })
  })
  const setViewEvents = await preview.evaluate((element) => {
    const events: unknown[] = []
    element.addEventListener('litecad:set-view', (event) => events.push((event as CustomEvent).detail))
    Object.assign(window, { __homeSetViewEvents: events })
    return events.length
  })
  expect(setViewEvents).toBe(0)

  await canvas.scrollIntoViewIfNeeded()
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  const modelBeforeDrag = await canvas.screenshot()
  const viewCubeBeforeDrag = await viewCube.screenshot()
  await page.mouse.move(bounds!.x + bounds!.width * 0.58, bounds!.y + bounds!.height * 0.52)
  await page.mouse.down()
  await page.mouse.move(bounds!.x + bounds!.width * 0.72, bounds!.y + bounds!.height * 0.42, { steps: 8 })
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __homeOrientationEvents?: unknown[] }).__homeOrientationEvents?.length ?? 0,
      ),
    )
    .toBeGreaterThan(0)
  const viewCubeDuringDrag = await viewCube.screenshot()
  expect(viewCubeDuringDrag.equals(viewCubeBeforeDrag)).toBe(false)
  const modelDuringDrag = await canvas.screenshot()
  expect(modelDuringDrag.equals(modelBeforeDrag)).toBe(false)
  await page.mouse.up()

  await expect(preview).toHaveAttribute('data-interacted', 'true')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
  const orientationEventCountAfterQueuedFrames = await page.evaluate(
    () => (window as typeof window & { __homeOrientationEvents?: unknown[] }).__homeOrientationEvents?.length ?? 0,
  )
  await page.waitForTimeout(180)
  const orientationEventsAfterSettle = await page.evaluate(
    () => (window as typeof window & { __homeOrientationEvents?: Array<{ at: number }> }).__homeOrientationEvents ?? [],
  )
  expect(orientationEventsAfterSettle).toHaveLength(orientationEventCountAfterQueuedFrames)
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { __homeSetViewEvents?: unknown[] }).__homeSetViewEvents?.length ?? 0,
      ),
    )
    .toBe(0)
  const orientationEventsBeforeSetView = orientationEventsAfterSettle.length
  await page.getByRole('button', { name: 'Rotate view left 45 degrees' }).click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __homeSetViewEvents?: unknown[] }).__homeSetViewEvents?.length ?? 0)).toBe(1)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __homeOrientationEvents?: unknown[] }).__homeOrientationEvents?.length ?? 0,
      ),
    )
    .toBeGreaterThan(orientationEventsBeforeSetView)
  await expect
    .poll(() =>
      page.evaluate(() => {
        type Orientation = { direction?: [number, number, number]; pitch: number; yaw: number }
        const instrumentedWindow = window as typeof window & {
          __homeOrientationEvents?: Array<{ detail: { orientation: Orientation } }>
          __homeSetViewEvents?: Array<{ orientation: Orientation }>
        }
        const requested = instrumentedWindow.__homeSetViewEvents?.[0]?.orientation
        const applied = instrumentedWindow.__homeOrientationEvents?.at(-1)?.detail.orientation
        if (!requested || !applied) {
          return false
        }
        return Math.abs(requested.yaw - applied.yaw) < 0.01 && Math.abs(requested.pitch - applied.pitch) < 0.01
      }),
    )
    .toBe(true)
  await page.waitForTimeout(450)
  await expect(preview).toHaveAttribute('data-interacted', 'true')

  await page.evaluate(() => {
    ;(window as typeof window & { __homeRafCount?: number }).__homeRafCount = 0
  })
  await page.waitForTimeout(500)
  const idleAnimationFrames = await page.evaluate(
    () => (window as typeof window & { __homeRafCount?: number }).__homeRafCount ?? 0,
  )
  expect(idleAnimationFrames).toBeLessThanOrEqual(2)

  await canvas.evaluate((element) => {
    ;(window as typeof window & { __homePreviewCanvas?: Element }).__homePreviewCanvas = element
  })
  await page.getByLabel('Language').selectOption('zh')
  await expect(page.getByLabel('语言')).toHaveValue('zh')
  await expect(canvas).toHaveAttribute('aria-label', '可交互旋转的 3D 机械法兰预览')
  expect(
    await canvas.evaluate(
      (element) => (window as typeof window & { __homePreviewCanvas?: Element }).__homePreviewCanvas === element,
    ),
  ).toBe(true)
  expect(browserErrors).toEqual([])
})

test('keeps the home page usable when WebGL is unavailable', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { user: { id: 'user_home', name: 'Home User', email: 'home@example.com' } } }),
  )
  await page.route('**/api/v1/studio/status', (route) =>
    route.fulfill({ json: { name: 'LiteCAD', status: 'ready', summary: 'Ready', capabilities: [] } }),
  )
  await page.addInitScript(() => {
    window.localStorage.setItem('litecad:language', 'en')
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value(contextID: string) {
        if (contextID.includes('webgl')) {
          return null
        }
        return null
      },
    })
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('[data-home-model-preview-unavailable]')).toContainText('3D preview unavailable')
  await expect(page.getByText('Interactive 3D sample')).toHaveCount(0)
  await expect(page.locator('[data-home-model-preview]')).toHaveCount(0)
  expect(browserErrors).toEqual([])
})
