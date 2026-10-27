import { expect, test } from '@playwright/test'

test.use({ hasTouch: true })

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort())
  await page.route('https://fonts.gstatic.com/**', route => route.abort())
  await page.route('**/api/magazine/config', route => route.fulfill({ json: { enabled: false, catalogSize: 6 } }))
  await page.route('**/api/decoder', () => { throw new Error('Authored demo must not invoke live inference') })
})
for (const width of [1280, 390]) {
  test(`Living Ad selection, alignment and return at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:4174/tests/browser/legacy.html')
    const card = page.locator('.catalog-card').first()
    const hotspot = card.getByRole('button', { name: 'Explore Paper shade' })
    await expect(hotspot).toBeVisible()
    const image = await card.locator('img').boundingBox(), point = await hotspot.boundingBox()
    expect(point!.width).toBeGreaterThanOrEqual(44)
    const sourceRatio = 1200 / 900
    const containWidth = Math.min(image!.width, image!.height * sourceRatio)
    const containHeight = containWidth / sourceRatio
    expect(point!.x + point!.width / 2).toBeCloseTo(image!.x + (image!.width - containWidth) / 2 + (760 / 1200) * containWidth, 0)
    expect(point!.y + point!.height / 2).toBeCloseTo(image!.y + (image!.height - containHeight) / 2 + (330 / 900) * containHeight, 0)
    if (width === 390) await hotspot.tap()
    else await hotspot.click()
    await expect(card.getByRole('region', { name: 'Paper shade editorial reveal' })).toBeVisible()
    await expect(card.locator('.region-dimming')).toBeVisible()
    await card.getByRole('button', { name: /Why does this composition/ }).click()
    await expect(card.getByText(/Authored interpretation:/)).toBeVisible()
    await card.getByRole('button', { name: 'Explore a related discovery' }).click()
    await expect(card.getByRole('complementary', { name: 'Related catalog discovery' })).toContainText('Pebble Chair')
    await card.screenshot({ path: `test-results/living-ad-${width}.png` })
    await card.getByRole('button', { name: 'Return to original image' }).click()
    await expect(hotspot).toBeFocused()
    await expect(card.locator('.region-dimming')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
test('keyboard interaction, reduced motion and full-frame letterboxing remain aligned', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('http://127.0.0.1:4174/tests/browser/legacy.html')
  await page.getByRole('button', { name: /Read sample edition/ }).click()
  const reader = page.getByRole('region', { name: 'A slower kind of discovery.' })
  await reader.getByRole('button', { name: 'Immersive / full frame' }).click()
  const hotspot = reader.getByRole('button', { name: 'Explore Paper shade' })
  await expect(hotspot).toBeVisible()
  await hotspot.focus(); await page.keyboard.press('Enter')
  await expect(reader.getByRole('region', { name: 'Paper shade editorial reveal' })).toBeVisible()
  expect(await reader.locator('.editorial-reveal').evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  const image = await reader.locator('img').first().boundingBox(), point = await hotspot.boundingBox()
  const renderedWidth = image!.height * 1200 / 900
  expect(point!.x + point!.width / 2).toBeCloseTo(image!.x + (image!.width - renderedWidth) / 2 + 760 / 1200 * renderedWidth, 0)
  await page.keyboard.press('Escape'); await expect(hotspot).toBeFocused()
  await expect(reader.locator('.editorial-reveal')).toHaveCount(0)
})
test('failed original image cannot leave misleading hotspots or editorial panels', async ({ page }) => {
  await page.route('**/catalog/home-lamp.svg', route => route.fulfill({ status: 404, body: '' }))
  await page.goto('http://127.0.0.1:4174/tests/browser/legacy.html')
  const card = page.locator('.catalog-card').first()
  await expect(card.getByText('Image unavailable')).toBeVisible()
  await expect(card.getByRole('button', { name: 'Explore Paper shade' })).toHaveCount(0)
  await expect(card.getByText('No real advertiser · fictional study')).toBeVisible()
})
