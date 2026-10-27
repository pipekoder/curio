import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort())
  await page.route('https://fonts.gstatic.com/**', route => route.abort())
  await page.route('**/api/magazine/config', route => route.fulfill({ json: { enabled: false, catalogSize: 6 } }))
  await page.route('**/api/magazine', () => { throw new Error('No inference is permitted in visual checks') })
})
for (const width of [1280, 390]) {
  test(`reader images, layouts and responsive bounds at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:4174/tests/browser/legacy.html')
    await expect(page.locator('.catalog-card')).toHaveCount(6)
    for (const image of await page.locator('.catalog-card img').all()) {
      await image.scrollIntoViewIfNeeded()
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
    }
    expect(await page.locator('.catalog-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(width === 1280 ? 3 : 1)
    await page.getByRole('button', { name: /Read sample edition/ }).click()
    const reader = page.getByRole('region', { name: 'A slower kind of discovery.' })
    await expect(reader).toHaveClass(/layout-airy/)
    await reader.screenshot({ path: `test-results/reader-airy-${width}.png` })
    await page.getByRole('button', { name: 'Immersive / full frame' }).click()
    await expect(reader).toHaveClass(/layout-immersive/)
    expect(await reader.locator('img').first().evaluate(element => getComputedStyle(element).objectFit)).toBe('contain')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(reader.locator('figure .attribution')).toHaveCount(0)
    await expect(reader.locator('.attribution')).toHaveCount(3)
    await reader.screenshot({ path: `test-results/reader-${width}.png` })
  })
}
test('reduced motion removes animation and image transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('http://127.0.0.1:4174/tests/browser/legacy.html')
  await page.getByRole('button', { name: /Read sample edition/ }).click()
  expect(await page.locator('.reader-pages').evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  expect(await page.locator('.catalog-card img').first().evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
  await page.getByRole('button', { name: 'Immersive / full frame' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.layout-immersive')).toBeVisible()
})
test('missing static asset retains accessible content and provenance', async ({ page }) => {
  await page.route('**/catalog/home-lamp.svg', route => route.fulfill({ status: 404, body: '' }))
  await page.goto('http://127.0.0.1:4174/tests/browser/legacy.html')
  await expect(page.getByText('Image unavailable')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Paper Moon Lamp' })).toBeVisible()
  await page.locator('.catalog-card').first().getByText('Source & provenance').click()
  await expect(page.getByText(/Catalog home-lamp/)).toBeVisible()
})

test('component regression navigation never requests private asset intelligence or external candidate images', async ({ page }) => {
  const forbidden: string[] = []
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/operator/') || ['normcph.com','media.oliverbonas.com','assets.bolia.com','hoshinoresorts.com'].includes(url.hostname)) forbidden.push(request.url())
  })
  await page.goto('http://127.0.0.1:4174/tests/browser/legacy.html')
  await expect(page.locator('.catalog-card')).toHaveCount(6)
  await page.getByRole('button', { name: /Read sample edition/ }).click()
  await expect(page.locator('.reader-pages')).toBeVisible()
  await page.getByRole('button', { name: 'Immersive / full frame' }).click()
  await expect(page.locator('.layout-immersive')).toBeVisible()
  expect(forbidden).toEqual([])
})
