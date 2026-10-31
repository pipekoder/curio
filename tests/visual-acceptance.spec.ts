import { expect, test, type Page } from '@playwright/test'
import { writeFileSync, readdirSync, statSync } from 'node:fs'
// Navigation's load event can precede React's scheduled initial commit. Keyboard
// input does not auto-wait like locator actions: wait for the reader, not a timer.
async function expectKeyboardSkip(page: Page) {
  const skip = page.getByRole('link', { name: 'Skip to magazine prompt', exact: true })
  const prompt = page.getByRole('textbox', { name: 'Your discovery prompt', exact: true })
  await expect(skip).toBeAttached()
  await expect(prompt).toBeEditable()
  // Assert startup did not autofocus a control; never focus/blur one to pass.
  await expect(page.locator('body')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(prompt).toBeFocused()
}
for (const width of [1440,390]) test(`reader accessibility, privacy and synthetic performance at ${width}px`, async({page})=>{
  await page.setViewportSize({width,height:1000}); await page.emulateMedia({reducedMotion:'reduce'})
  let outbound=0
  await page.route('**/*',route=>{
    const url=new URL(route.request().url())
    if(url.origin!=='http://127.0.0.1:4173'){outbound++;return route.abort()}
    if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'AI disabled'}})
    return route.continue()
  })
  await page.goto('/?legacy=1')
  await expectKeyboardSkip(page)
  await page.getByRole('button',{name:'Try a prompt: Quiet rooms'}).click()
  const started=Date.now()
  await page.getByRole('button',{name:'Generate magazine'}).click()
  await expect(page.getByRole('heading',{name:'The art of quiet rooms'})).toBeVisible()
  const composeMs=Date.now()-started
  expect(composeMs).toBeLessThan(10000)
  const feature=page.locator('.personal-feature').first()
  await expect(feature.getByRole('button',{name:'Explore Paper shade'})).toBeVisible()
  for(const img of await page.locator('img').all())expect((await img.getAttribute('alt'))?.length).toBeGreaterThan(0)
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('paper quiet lamp')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  expect(outbound).toBe(0)
  const files=readdirSync('dist/assets')
  const size=(names:string[])=>names.reduce((n,f)=>n+statSync(`dist/assets/${f}`).size,0)
  // This route loads only the entry chunk; the spatial chunk is lazy-loaded on /spatial.
  const entry=files.filter(n=>/^index-.*\.js$/.test(n))
  expect(entry.length).toBeGreaterThan(0)
  const entryBytes=size(entry)
  expect(entryBytes).toBeLessThan(500000)
  const spatial=files.filter(n=>n.startsWith('SpatialApp-')&&n.endsWith('.js'))
  expect(spatial.length).toBeGreaterThan(0)
  const spatialBytes=size(spatial)
  expect(spatialBytes).toBeLessThan(650000)
  for (const label of await page.locator('.eyebrow').all()) {
    if (!await label.isVisible()) continue
    const ratio = await label.evaluate(element => {
      const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0,3).map(Number)
      const luminance = (c: number[]) => c.map(v => { const x=v/255; return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4 }).reduce((n,v,i)=>n+v*[0.2126,0.7152,0.0722][i],0)
      let parent: Element | null = element, background='rgb(246,244,239)'
      while(parent){const color=getComputedStyle(parent).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent'){background=color;break}parent=parent.parentElement}
      const a=luminance(rgb(getComputedStyle(element).color)),b=luminance(rgb(background))
      return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)
    })
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  }
  const navigationMs=await page.evaluate(()=>performance.getEntriesByType('navigation')[0]?.duration??null)
  writeFileSync(`test-results/performance-${width}.json`,JSON.stringify({environment:'local synthetic, not production Core Web Vitals',width,composeMs,navigationMs,entryBytes,spatialBytes,externalRequests:outbound,modelCalls:0},null,2))
  await page.locator('.issue-cover').screenshot({path:`test-results/acceptance-cover-${width}.png`})
})

for (const width of [1440,390]) test(`keyboard skip waits for delayed application startup at ${width}px`, async({page})=>{
  await page.setViewportSize({width,height:1000})
  await page.emulateMedia({reducedMotion:'reduce'})
  let release!: () => void, requested!: () => void
  const boot = new Promise<void>(resolve=>{release=resolve})
  const bundleRequested = new Promise<void>(resolve=>{requested=resolve})
  await page.route('**/assets/*.js',async route=>{requested();await boot;await route.continue()})
  try {
    // Intentionally navigate before the app bundle loads: a load-event/React
    // scheduling gap must not allow the first Tab to be sent to an empty page.
    await page.goto('/?legacy=1',{waitUntil:'commit'})
    await bundleRequested
    const keyboardCheck = expectKeyboardSkip(page)
    await expect(page.locator('#root')).toBeEmpty()
    await expect(page.locator('body')).toBeFocused()
    release()
    await keyboardCheck
  } finally { release() }
})
