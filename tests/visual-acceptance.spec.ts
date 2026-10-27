import { expect, test } from '@playwright/test'
import { writeFileSync, readdirSync, statSync } from 'node:fs'
for (const width of [1440,390]) test(`reader accessibility, privacy and synthetic performance at ${width}px`, async({page})=>{
  await page.setViewportSize({width,height:1000}); await page.emulateMedia({reducedMotion:'reduce'})
  let outbound=0
  await page.route('**/*',route=>{
    const url=new URL(route.request().url())
    if(url.origin!=='http://127.0.0.1:4173'){outbound++;return route.abort()}
    if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'AI disabled'}})
    return route.continue()
  })
  await page.goto('/'); await page.keyboard.press('Tab')
  await expect(page.locator('.skip-link')).toBeFocused()
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
  const jsBytes=files.filter(n=>n.endsWith('.js')).reduce((n,f)=>n+statSync(`dist/assets/${f}`).size,0)
  expect(jsBytes).toBeLessThan(500000)
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
  writeFileSync(`test-results/performance-${width}.json`,JSON.stringify({environment:'local synthetic, not production Core Web Vitals',width,composeMs,navigationMs,jsBytes,externalRequests:outbound,modelCalls:0},null,2))
  await page.locator('.issue-cover').screenshot({path:`test-results/acceptance-cover-${width}.png`})
})
