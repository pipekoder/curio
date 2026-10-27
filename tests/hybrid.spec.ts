import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
const url = 'https://cdn.example.test/approved-image.webp'
const harness = 'http://127.0.0.1:4174/tests/browser/hybrid.html'
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort())
  await page.route('https://fonts.gstatic.com/**', route => route.abort())
})
test('approved cross-origin image loads without a referrer or CORS headers', async ({ page }) => {
  let requested = false
  await page.route(url, async route => {
    requested = true
    expect(route.request().headers().referer).toBeUndefined()
    await route.fulfill({ contentType: 'image/svg+xml', body: await readFile('public/catalog/home-lamp.svg', 'utf8') })
  })
  await page.goto(harness)
  const image = page.getByRole('img')
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  expect(requested).toBe(true)
  await expect(page.getByRole('link', { name: /View original source page/ })).toHaveAttribute('href', 'https://source.example.test/campaign/test')
})
test('hotlink rejection shows the fictional fallback and retains attribution', async ({ page }) => {
  await page.route(url, route => route.fulfill({ status: 403, body: '' }))
  await page.goto(harness)
  await expect(page.getByRole('img')).toHaveAttribute('src', '/catalog/home-lamp.svg')
  await expect(page.getByText(/Fictional fallback illustration · Curio/)).toBeVisible()
  await expect(page.getByRole('link', { name: /View original source page/ })).toBeVisible()
})
test('unapproved image URL is never requested', async ({ page }) => {
  let requests = 0
  await page.route(url, route => { requests++; return route.abort() })
  await page.goto(`${harness}?unapproved`)
  await expect(page.getByText('Image unavailable')).toBeVisible()
  await expect(page.locator('img')).toHaveCount(0)
  await expect(page.getByRole('link')).toHaveCount(0)
  expect(requests).toBe(0)
})
test('SVG image content cannot execute HTML or scripts in the editorial surface', async ({ page }) => {
  await page.route(url, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" onload="parent.__hybridXss=1"><script>parent.__hybridXss=1</script><rect width="1200" height="900" fill="tan"/></svg>' }))
  await page.goto(harness)
  await expect.poll(() => page.getByRole('img').evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  expect(await page.evaluate(() => '__hybridXss' in window)).toBe(false)
  await expect(page.locator('.attribution script, .attribution iframe')).toHaveCount(0)
})
