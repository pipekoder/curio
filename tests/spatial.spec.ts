import {test,expect,type Page,type Route} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join,dirname} from 'node:path'
import {articleResponseFixture} from './article-fixtures'

// Serialized readerDemoCatalog records (demo-curio-owner-08/18-v1); the
// edition adapter validates them strictly, so fixture drift fails loudly.
const groundedItems=JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)),'spatial-grounded-items.json'),'utf8')) as unknown[]

// Grounded in readerDemoCatalog records: names, tags, and the fixed
// editorialCopy narrative shared by every catalog item.
const metaPlan={
  title:'A testing promenade',
  deck:'Two grounded exhibits for the spatial suite.',
  features:[
    {catalogId:'demo-curio-owner-08-v1',assetId:'curio-owner-08-v1',headline:'A closer look: Ochre Arc Chair',narrative:'A subjective visual reading: consider the drawn forms and the space between them. Let this composition lead to another idea, without inferring materials or product identity.',layout:'hero',motion:'still',theme:'Quiet Luxury'},
    {catalogId:'demo-curio-owner-18-v1',assetId:'curio-owner-18-v1',headline:'A closer look: Window Overshirt',narrative:'An invitation to pause: look at the relationship between silhouette, scale and empty space. This editorial interpretation is a point of departure, not a factual claim about an object.',layout:'split',motion:'still',theme:'Quiet Luxury'},
  ],
}

declare global{
  interface Window{__spatial?:()=>{distance:number;cameraZ:number;cameraY:number;current:number;exhibits:number;nodes:number;source:string;assembly:string;mode:string;orbit:{yaw:number;pitch:number;radius:number};selected:number;staged:string[];nodeIds:string[]}}
}

async function submitPrompt(page:Page):Promise<void>{
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  await page.getByRole('button',{name:'Begin exploration'}).click()
}

test('/spatial opens the silver field with an immediately usable prompt',async({page})=>{
  const noise:string[]=[]
  // Resource-load failures are the handled fallback paths (no Worker in
  // preview): the manifest fallback and authored edition are asserted below.
  page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource'))noise.push(message.text())})
  page.on('pageerror',error=>{noise.push(String(error))})
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.getByLabel('Your curiosity')).toBeVisible()
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('Curio-authored edition · AI not used')
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:15000})
  const snapshot=await page.evaluate(()=>window.__spatial?.())
  expect(snapshot?.exhibits).toBeGreaterThan(0)
  expect(snapshot?.nodes).toBeGreaterThanOrEqual(6)
  expect(snapshot?.source).toBe('manifest')
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toContainText('local manifest')
  expect(noise).toEqual([])
})

test('scrolling travels the camera through genuine depth',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  const top=await page.evaluate(()=>window.__spatial?.().cameraZ)
  await page.evaluate(()=>window.scrollTo(0,(document.documentElement.scrollHeight-window.innerHeight)*0.8))
  await expect.poll(()=>page.evaluate(()=>window.__spatial?.().cameraZ)).toBeLessThan(top!)
  const mid=await page.evaluate(()=>window.__spatial?.())
  expect(mid?.mode).toBe('promenade')
  await page.evaluate(()=>window.scrollTo(0,0))
  await expect.poll(()=>page.evaluate(()=>window.__spatial?.().cameraZ)).toBeGreaterThan(top!-1)
})

test('scrolling to the end of the promenade opens the journey',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.waitForFunction(()=>((window.__spatial?.().nodes)??0)>0)
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toBeVisible()
  await expect(page.getByLabel('Your curiosity')).toBeHidden()
  await page.waitForTimeout(1800)
  await page.getByRole('button',{name:'← Promenade'}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
  await expect(page.getByLabel('Your curiosity')).toBeVisible()
})

test('clear sits with surprise me in the journey controls',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.waitForFunction(()=>((window.__spatial?.().nodes)??0)>0)
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  const order=await page.evaluate(()=>{
    const bar=document.getElementById('spatial-journey')
    return [...(bar?.querySelectorAll('button')??[])].map(b=>b.textContent)
  })
  expect(order.indexOf('Clear')).toBe(order.indexOf('Surprise me')+1)
})

test('arriving at an exhibit reveals its lateral rail',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  const exhibits=await page.evaluate(()=>window.__spatial?.().exhibits??0)
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight*0.22))
  await expect(page.locator('.spatial-crumb')).toContainText(`Exhibit 1 of ${exhibits}`,{timeout:10000})
  await expect(page.locator('.spatial-rail')).toBeVisible()
  await expect(page.locator('.spatial-rail-card').first()).toContainText('Story')
  await page.locator('.spatial-rail').evaluate(el=>{el.scrollLeft=el.scrollWidth})
  await expect(page.locator('.spatial-rail-card').last()).toBeInViewport()
  await page.screenshot({path:'test-results/spatial-promenade-1440.png'})
})

test('exhibit decor keeps only approved markers and an animated scroll cue',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  await page.waitForFunction(()=>window.__spatial?.().assembly==='idle',{timeout:30000})
  await expect(page.locator('.exhibit-decor .decor-plane')).toHaveCount(0)
  await expect(page.locator('.exhibit-decor .decor-tag')).toHaveCount(2)
  await expect(page.locator('.exhibit-decor')).toContainText('Exhibit 01')
  await expect(page.locator('.exhibit-decor')).toContainText('Culture')
  await expect(page.locator('.exhibit-decor')).not.toContainText('Objects')
  await expect(page.locator('.exhibit-decor')).not.toContainText('Materials')
  await expect(page.locator('.exhibit-decor .decor-scroll-dot')).toHaveCount(1)
})

test('the card reads the full story inline and expand returns without moving the camera',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  await page.waitForFunction(()=>window.__spatial?.().assembly==='idle',{timeout:30000})
  // Let the settle glide finish so the stillness check starts from rest.
  await page.waitForFunction(()=>{
    const d=window.__spatial?.().distance??0
    const w=window as unknown as {__lastD?:number}
    const settled=w.__lastD!==undefined&&Math.abs(d-w.__lastD)<1e-9
    w.__lastD=d
    return settled
  },{timeout:15000,polling:400})
  const before=await page.evaluate(()=>window.__spatial?.().distance)
  const card=page.locator('#spatial-rail .rail-story')
  await expect(card).toBeVisible()
  // The full article reads inline: no Read Story step remains.
  await expect(card.getByRole('heading',{name:/A closer look/})).toBeVisible()
  await expect(card).toContainText('Story · Exhibit 1 of')
  await expect(card.locator('.object-frame img')).toBeVisible()
  // Scrolling the card never moves the camera or dismisses the card.
  await card.evaluate(el=>{el.scrollTop=el.scrollHeight})
  await expect(card).toBeVisible()
  await card.getByRole('button',{name:'Expand story'}).click()
  const expanded=page.locator('.spatial-story.is-expanded')
  await expect(expanded).toBeVisible()
  await expect(expanded.getByRole('heading',{name:/A closer look/})).toBeFocused()
  await expect(expanded.locator('.object-frame img')).toBeVisible()
  await expect(expanded).toContainText('Story · Exhibit 1 of')
  await page.keyboard.press('Escape')
  await expect(expanded).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Expand story'})).toBeFocused()
  const after=await page.evaluate(()=>window.__spatial?.().distance)
  expect(after).toBeCloseTo(before!,6)
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of')
})

test('a story without V3 claims offers no Sources affordance',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  await page.waitForFunction(()=>window.__spatial?.().assembly==='idle',{timeout:30000})
  await expect(page.locator('#spatial-rail .rail-story')).toContainText('A closer look')
  await expect(page.locator('.spatial-sources')).toHaveCount(0)
})

// Synthetic V3 plan + citations fixtures: shapes follow the contract, values
// are test-only (example.org is never presented as a real Curio source).
const v3Plan={
  ...metaPlan,
  culturalEvidenceVersion:'curio-cultural-evidence-v3.0.0',
  features:metaPlan.features.map(feature=>({...feature,culturalClaims:[{sourceId:'source:example'}]})),
}
const citationsFixture={
  version:'curio-public-citations-v1',
  features:[{
    featureIndex:0,catalogId:'demo-curio-owner-08-v1',assetId:'curio-owner-08-v1',
    headline:'A closer look: Ochre Arc Chair',
    citations:[{
      claimId:'claim:ritual',sourceId:'source:example:claim:ritual',
      narrativeText:'An approved editorial comparison about an everyday ritual.',
      claimKind:'comparison',evidenceStatus:'operator_reviewed',reviewStatus:'approved',
      sources:[{
        sourceId:'source:example',passageId:'passage:example',
        canonicalUrl:'https://example.org/article',publication:'Example Review',
        support:{kind:'reviewed_paraphrase',text:'An approved editorial comparison about an everyday ritual.'},
      }],
    }],
  }],
}

test('V3 sources open on demand with reviewed claims only',async({page})=>{
  let citationsBody:unknown='unset'
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:v3Plan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}}))
  await page.route('**/api/editorial/citations',route=>{
    citationsBody=route.request().postDataJSON()
    return route.fulfill({status:200,json:citationsFixture})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:15000})
  await page.waitForFunction(()=>window.__spatial?.().assembly==='idle',{timeout:30000})
  const card=page.locator('#spatial-rail .rail-story')
  await expect(card).toContainText('A closer look')
  const sources=card.locator('.spatial-sources')
  await expect(sources).toHaveCount(1)
  // No lookup happens before the visitor opens Sources.
  expect(citationsBody).toBe('unset')
  await sources.getByRole('button',{name:'Sources & References ▸'}).click()
  await expect(sources).toContainText('An approved editorial comparison about an everyday ritual.')
  await expect(sources).toContainText('Comparison · Operator reviewed · Approved')
  await expect(sources).toContainText('Reviewed paraphrase · Example Review')
  await expect(sources.getByRole('link',{name:'Open source ↗'})).toHaveAttribute('href','https://example.org/article')
  // The lookup POSTs the plan alone: no prompt, preferences, or token.
  expect(Object.keys(citationsBody as Record<string,unknown>)).toEqual(['plan'])
  // Sources & References is the separated bottom section of the story card.
  const order=await card.evaluate(el=>[...el.children].map(child=>child.className))
  expect(order[order.length-1]).toContain('spatial-sources')
})

test('unavailable citations hide gracefully without blocking the story',async({page})=>{
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:v3Plan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}}))
  await page.route('**/api/editorial/citations',route=>route.fulfill({status:404,json:{error:'gone'}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:15000})
  await page.waitForFunction(()=>window.__spatial?.().assembly==='idle',{timeout:30000})
  const card=page.locator('#spatial-rail .rail-story')
  const sources=card.locator('.spatial-sources')
  await sources.getByRole('button',{name:/Sources/}).click()
  // An empty lookup hides the section instead of leaving a placeholder.
  await expect(sources).toHaveCount(0)
  await expect(card).toContainText('A closer look: Ochre Arc Chair')
})

test('the inspiration row fills the prompt with a sentence without generating',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.locator('.spatial-suggestions-label')).toContainText('Need a little inspiration?')
  // Measure at steady state: the dock entrance scales from .55 to 1 over 1.6s.
  await page.locator('.spatial-dock').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)))
  const row=page.locator('.spatial-seed-row')
  const seed=row.locator('.spatial-seed')
  await expect(seed).toHaveCount(1)
  expect(await seed.textContent()).toContain('·')
  // Seed plus one perfectly round icon button share one row.
  const circles=row.locator('.spatial-circle')
  await expect(circles).toHaveCount(1)
  for(const circle of await circles.all()){
    const box=await circle.boundingBox()
    expect(Math.abs(box!.width-box!.height)).toBeLessThan(0.5)
    expect(box!.width).toBeGreaterThanOrEqual(36)
  }
  await expect(row.getByRole('button',{name:'Refresh suggestion'})).toHaveAttribute('title','Refresh suggestion')
  await seed.click()
  const filled=await page.getByLabel('Your curiosity').inputValue()
  expect(filled.startsWith("I'm curious about ")).toBe(true)
  expect(filled.endsWith('.')).toBe(true)
  await expect(page.getByTestId('spatial-edition-chip')).toHaveCount(0)
  // Free writing still works with no fixed format.
  await page.getByLabel('Your curiosity').fill('just some words')
  await expect(page.getByLabel('Your curiosity')).toHaveValue('just some words')
})

test('refresh swaps the seed without repeating it',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  const seed=page.locator('.spatial-seed')
  const first=await seed.textContent()
  await page.getByRole('button',{name:'Refresh suggestion'}).click()
  const second=await seed.textContent()
  expect(second).not.toBe(first)
})

test('discover headline, subtitle and control rows align with the prompt input',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.route('**/api/editorial/capabilities',route=>route.fulfill({status:200,json:modelCaps}))
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.getByRole('heading',{name:'Beyond ads. Into discovery.'})).toBeVisible()
  await expect(page.locator('.spatial-dock')).toContainText('Follow your curiosity through stories, brands and discoveries that speak to your interests.')
  await expect(page.locator('.spatial-seed-row').getByRole('button',{name:'Surprise me'})).toHaveCount(0)
  // Measure at steady state: the dock entrance scales from .55 to 1 over 1.6s.
  await page.locator('.spatial-dock').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)))
  const input=await page.getByLabel('Your curiosity').boundingBox()
  const label=await page.locator('.spatial-suggestions-label').boundingBox()
  const seed=await page.locator('.spatial-seed').boundingBox()
  const refresh=await page.locator('.spatial-seed-row').getByRole('button',{name:'Refresh suggestion'}).boundingBox()
  const modeText=await page.locator('.spatial-mode-row .spatial-fine').boundingBox()
  const modeSwitch=await page.locator('.spatial-mode-row fieldset').boundingBox()
  // The prompt input is the horizontal alignment reference.
  expect(Math.abs(label!.x-input!.x)).toBeLessThan(1.5)
  expect(Math.abs((refresh!.x+refresh!.width)-(input!.x+input!.width))).toBeLessThan(1.5)
  expect(Math.abs((modeSwitch!.x+modeSwitch!.width)-(input!.x+input!.width))).toBeLessThan(1.5)
  // Each control row shares one horizontal row.
  const center=(box:{y:number;height:number})=>box.y+box.height/2
  expect(Math.abs(center(label!)-center(seed!))).toBeLessThan(12)
  expect(Math.abs(center(seed!)-center(refresh!))).toBeLessThan(1.5)
  expect(Math.abs(center(modeText!)-center(modeSwitch!))).toBeLessThan(12)
  // The mode description tracks the selected mode.
  await expect(page.locator('.spatial-mode-row .spatial-fine')).toContainText('Faster delivery.')
  await page.locator('input[name=editorial-mode][value=hybrid]').check()
  await expect(page.locator('.spatial-mode-row .spatial-fine')).toContainText('Deeper editorial exploration.')
})

test('discover control rows stay within the viewport at mobile width',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.getByRole('heading',{name:'Beyond ads. Into discovery.'})).toBeVisible()
  await page.locator('.spatial-dock').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)))
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1)
  expect(overflow).toBe(false)
  for(const selector of ['.spatial-suggestions-label','.spatial-seed','.spatial-mode-row fieldset']){
    const box=await page.locator(selector).first().boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(-1)
    expect(box!.x+box!.width).toBeLessThanOrEqual(391)
  }
})

const modelCaps={version:'curio-editorial-model-routing-v1',defaultMode:'lite',liteAvailable:true,hybridAvailable:true,modes:[]}
const hybridGeneration={version:'curio-editorial-model-routing-v1',editorialMode:'hybrid',chiefEditorModel:'muse-wonder-1.0',reviewerModel:'muse-spark-1.3',revisionModel:null,confirmationModel:null}

test('hybrid stays disabled without capabilities and the mode is omitted',async({page})=>{
  let body:unknown=null
  await page.route('**/api/editorial',route=>{
    body=route.request().postDataJSON()
    return route.fulfill({status:503,json:{error:'AI disabled'}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.locator('input[name=editorial-mode][value=lite]')).toBeChecked()
  await expect(page.locator('input[name=editorial-mode][value=hybrid]')).toBeDisabled()
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('Curio-authored edition · AI not used',{timeout:15000})
  expect(Object.keys(body as Record<string,unknown>).sort()).toEqual(['consent','prompt'])
})

test('hybrid mode propagates, shows while generating, and confirms on the chip',async({page})=>{
  const bodies:unknown[]=[]
  await page.route('**/api/editorial/capabilities',route=>route.fulfill({status:200,json:modelCaps}))
  await page.route('**/api/editorial',async route=>{
    bodies.push(route.request().postDataJSON())
    await new Promise(resolve=>setTimeout(resolve,1500))
    return route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false,generation:hybridGeneration}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  const hybrid=page.locator('input[name=editorial-mode][value=hybrid]')
  await expect(hybrid).toBeEnabled()
  // Native radios keep full keyboard support: arrows move the selection.
  await page.locator('input[name=editorial-mode][value=lite]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(hybrid).toBeChecked()
  await submitPrompt(page)
  await expect(page.locator('.spatial-generating')).toContainText('Hybrid · Wonder + Spark')
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:15000})
  expect((bodies[0] as Record<string,unknown>).editorialMode).toBe('hybrid')
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI-curated edition · Meta AI · Hybrid')
})

test('generating panel is wide, centered and legible while composing',async({page})=>{
  await page.route('**/api/editorial',async route=>{
    await new Promise(resolve=>setTimeout(resolve,1500))
    return route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await submitPrompt(page)
  const panel=page.locator('.spatial-generating')
  await expect(panel).toContainText('Composing your exhibition…')
  const box=await panel.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(650)
  expect(box!.width).toBeLessThanOrEqual(680)
  // Horizontally centered; vertically centered within the viewport area
  // below the fixed navigation header.
  expect(Math.abs((box!.x+box!.width/2)-720)).toBeLessThan(2)
  const header=await page.locator('.spatial-hud').boundingBox()
  const areaCenterY=header!.height+(900-header!.height)/2
  expect(Math.abs((box!.y+box!.height/2)-areaCenterY)).toBeLessThan(30)
  expect(box!.y).toBeGreaterThanOrEqual(header!.height)
  // Informational progress messages use the darker label gray when shown.
  const feed=page.locator('.editorial-progress-feed')
  if(await feed.count()){
    expect(await feed.evaluate(element=>getComputedStyle(element).color)).toBe('rgb(16, 18, 25)')
  }
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:15000})
})

test('generating panel fits narrow viewports without horizontal overflow',async({page})=>{
  await page.route('**/api/editorial',async route=>{
    await new Promise(resolve=>setTimeout(resolve,1500))
    return route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}})
  })
  await page.setViewportSize({width:390,height:844})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await submitPrompt(page)
  const panel=page.locator('.spatial-generating')
  await expect(panel).toContainText('Composing your exhibition…')
  const box=await panel.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(-1)
  expect(box!.x+box!.width).toBeLessThanOrEqual(391)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:15000})
})

test('failed generation chunk load shows a reload error instead of stranding the panel',async({page})=>{
  let intercepted:string|null=null
  await page.route('**/assets/articles-*.js',route=>{intercepted=route.request().url();return route.abort()})
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await page.getByLabel('Allow AI curation').check()
  await page.getByLabel(/Article edition/).check()
  await submitPrompt(page)
  await expect(page.locator('.spatial-mode-error strong')).toHaveText('Could not start generation.',{timeout:10000})
  await expect(page.getByText('Reload the page and try again.')).toBeVisible()
  expect(intercepted).toMatch(/\/assets\/articles-[A-Za-z0-9_-]+\.js$/)
  await expect(page.locator('.spatial-generating')).not.toContainText('elapsed')
  const submit=page.locator('button[type=submit]')
  await expect(submit).toBeEnabled()
  await expect(submit).toContainText('Begin exploration →')
})

test('failed standard chunk load shows a reload error instead of stranding the panel',async({page})=>{
  let intercepted:string|null=null
  await page.route('**/assets/editorial-progress-*.js',route=>{intercepted=route.request().url();return route.abort()})
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await submitPrompt(page)
  await expect(page.locator('.spatial-mode-error strong')).toHaveText('Could not start generation.',{timeout:10000})
  await expect(page.getByText('Reload the page and try again.')).toBeVisible()
  expect(intercepted).toMatch(/\/assets\/editorial-progress-[A-Za-z0-9_-]+\.js$/)
  await expect(page.locator('.spatial-generating')).not.toContainText('elapsed')
  const submit=page.locator('button[type=submit]')
  await expect(submit).toBeEnabled()
  await expect(submit).toContainText('Begin exploration →')
})

test('article opt-in stages three docks and renders deck plus brand captions',async({page})=>{
  let body:unknown=null
  await page.route('**/api/editorial',route=>{
    body=route.request().postDataJSON()
    return route.fulfill({status:200,json:articleResponseFixture()})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await page.getByLabel('Allow AI curation').check()
  await page.getByLabel(/Article edition/).check()
  await submitPrompt(page)
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of 3',{timeout:15000})
  expect((body as Record<string,unknown>).editionFormat).toBe('curio-editorial-articles-v1')
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI-curated edition · Meta AI · Article edition')
  const card=page.locator('#spatial-rail .rail-story')
  await expect(card).toContainText('The quiet craft of demo article 1')
  await expect(card).toContainText('A short introduction to demo article 1.')
  await expect(card.locator('figure')).toHaveCount(3)
  await expect(card).toContainText('Atelier Nord')
  await expect(card).toContainText('Casa Lumen')
  // Article editions carry no EditorialPlan, so Sources stays hidden.
  await expect(card.getByRole('button',{name:/Sources/})).toHaveCount(0)
  await card.getByRole('button',{name:'Expand story'}).click()
  await expect(page.locator('.spatial-story.is-expanded')).toContainText('The quiet craft of demo article 1')
  await page.keyboard.press('Escape')
  await expect(page.locator('.spatial-story.is-expanded')).toHaveCount(0)
})

test('article budget denial names the actual limit and retry time',async({page})=>{
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{format:'curio-editorial-articles-v1',source:'deterministic',retrieval:'d1',cached:false,articleEdition:null,status:'fallback',fallbackReason:'budget',budget:{limitType:'per_ip_hourly',limit:4,used:4,remaining:0,requestedUnits:4,measure:'units',retryAfterSeconds:3600}}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await page.getByLabel('Allow AI curation').check()
  await page.getByLabel(/Article edition/).check()
  await submitPrompt(page)
  const alert=page.getByRole('alert')
  await expect(alert).toContainText('hourly inference allowance')
  await expect(alert).toContainText('4 inference units')
  await expect(alert).toContainText('3600 seconds')
})

test('insufficient article content discloses state and retries the standard edition',async({page})=>{
  const bodies:unknown[]=[]
  // This test is about an article→standard retry; keep unrelated discovery
  // capabilities off the preview server's unavailable API proxy.
  await page.route('**/api/editorial/capabilities',route=>route.fulfill({status:200,json:{version:'curio-editorial-model-routing-v1',defaultMode:'lite',liteAvailable:true,hybridAvailable:false,modes:[]}}))
  await page.route('**/api/editorial',route=>{
    const payload=route.request().postDataJSON() as Record<string,unknown>
    bodies.push(payload)
    if(payload.editionFormat)return route.fulfill({status:409,json:{status:'insufficient_content',eligibleImages:5,requiredImages:6,fallbackReason:'insufficient_content'}})
    return route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}})
  })
  await test.step('open spatial and choose article format',async()=>{
    await page.setViewportSize({width:1440,height:900})
    await page.goto('/spatial')
    await expect(page.locator('.spatial-canvas')).toBeVisible({timeout:8000})
    await page.getByLabel(/Article edition/).check({timeout:8000})
  })
  await test.step('article response reports insufficient imagery',async()=>{
    await submitPrompt(page)
    const alert=page.getByRole('alert')
    await expect(alert).toContainText('Not enough approved imagery',{timeout:8000})
    await expect(alert).toContainText('5 of 6',{timeout:8000})
    await expect(page.locator('.spatial-generating')).toHaveCount(0)
    await expect(alert.locator('.editorial-progress')).toBeVisible({timeout:8000})
    await expect(page.getByTestId('spatial-edition-chip')).toHaveCount(0)
    expect(bodies).toHaveLength(1)
    expect((bodies[0] as Record<string,unknown>).editionFormat).toBe('curio-editorial-articles-v1')
  })
  await test.step('explicit retry requests and stages the standard edition',async()=>{
    await page.getByRole('button',{name:'Continue with the standard edition'}).click({timeout:8000})
    await expect.poll(()=>bodies.length,{timeout:8000}).toBe(2)
    expect((bodies[1] as Record<string,unknown>).editionFormat).toBeUndefined()
    await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of 2',{timeout:8000})
    await expect(page.getByTestId('spatial-edition-chip')).not.toContainText('Article edition')
  })
})

test('a refused hybrid stages nothing and retries explicitly in lite',async({page})=>{
  const bodies:unknown[]=[]
  await page.route('**/api/editorial/capabilities',route=>route.fulfill({status:200,json:modelCaps}))
  await page.route('**/api/editorial',route=>{
    bodies.push(route.request().postDataJSON())
    if(bodies.length===1)return route.fulfill({status:503,json:{code:'hybrid_unavailable',error:'Hybrid editorial mode is currently unavailable.'}})
    return route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.locator('input[name=editorial-mode][value=hybrid]')).toBeEnabled()
  await page.locator('input[name=editorial-mode][value=hybrid]').check()
  await submitPrompt(page)
  const error=page.locator('.spatial-mode-error')
  await expect(error).toBeVisible()
  await expect(error).toContainText('Nothing was generated.')
  expect(await page.evaluate(()=>window.__spatial?.().exhibits??0)).toBe(0)
  await expect(page.getByTestId('spatial-edition-chip')).toHaveCount(0)
  await error.getByRole('button',{name:'Switch to Lite & retry'}).click()
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:15000})
  expect(bodies).toHaveLength(2)
  expect((bodies[0] as Record<string,unknown>).editorialMode).toBe('hybrid')
  expect((bodies[1] as Record<string,unknown>).editorialMode).toBe('lite')
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI-curated edition · Meta AI')
  await expect(page.getByTestId('spatial-edition-chip')).not.toContainText('Hybrid')
  await page.getByRole('button',{name:'New Discovery'}).click()
  await expect(page.locator('input[name=editorial-mode][value=lite]')).toBeChecked()
  // A new discovery reopens the prompt without wiping staged journey records.
  expect(await page.evaluate(()=>window.__spatial?.().exhibits??0)).toBeGreaterThan(0)
  expect(await page.evaluate(()=>window.__spatial?.().nodeIds.length??0)).toBeGreaterThan(0)
})

test('journey node panel shows the node artwork',async({page})=>{
  await openJourney(page)
  await page.getByRole('button',{name:'Surprise me'}).click()
  const panel=page.getByTestId('spatial-node-panel')
  await expect(panel).toBeVisible()
  const figure=panel.locator('.spatial-node-figure img')
  await expect(figure).toBeVisible()
  expect(await figure.getAttribute('src')).toMatch(/^\/(editorial|catalog)\//)
})

test('discover stays usable under reduced motion',async({browser})=>{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'})
  const page=await context.newPage()
  await page.goto('/spatial')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.locator('.spatial-seed')).toHaveCount(1)
  await page.locator('.spatial-seed').click()
  expect(await page.getByLabel('Your curiosity').inputValue()).not.toBe('')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:30000})
  await context.close()
})

test('promenade visits every dock with its story rail',async({page})=>{
  test.setTimeout(120000)
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  // The assembly director settles the page at dock 0 when it finishes; wait
  // for that before driving the dock loop so no late settle yanks us back.
  await page.waitForFunction(()=>window.__spatial?.().assembly==='idle',{timeout:30000})
  const exhibits=await page.evaluate(()=>window.__spatial?.().exhibits??0)
  expect(exhibits).toBeGreaterThan(0)
  for(let i=0;i<exhibits;i++){
    await page.evaluate(([idx,count])=>{
      const max=document.documentElement.scrollHeight-window.innerHeight
      window.scrollTo(0,max*(60+idx*40)/(60+(count-1)*40+50))
    },[i,exhibits])
    await expect(page.locator('.spatial-crumb')).toContainText(`Exhibit ${i+1} of ${exhibits}`,{timeout:10000})
    await expect(page.locator('.spatial-rail')).toBeVisible()
    await expect(page.locator('.spatial-rail-card').first()).toContainText('Story')
  }
})

test('a hotspot marker shows its authored detail and releases',async({page})=>{
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight*0.22))
  await expect(page.locator('.spatial-rail')).toBeVisible()
  const card=page.locator('#spatial-rail .rail-story')
  await card.getByRole('button',{name:/^Inspect /}).first().click()
  const popover=card.locator('.object-popover')
  await expect(popover).toBeVisible()
  await expect(popover.locator('h3')).not.toBeEmpty()
  await expect(popover).toContainText('no SAM inference')
  await page.screenshot({path:'test-results/spatial-hotspot-1440.png'})
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
})

test('clicking a staged mount keeps reading inline without a separate panel',async({page})=>{
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight*0.22))
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:10000})
  await page.mouse.click(720,420)
  // A mount or ring hit travels to that exhibit or spotlights its hotspot
  // inline; a separate inspection surface never opens.
  await expect(page.locator('.spatial-inspect:not(.spatial-node-panel)')).toHaveCount(0)
  await expect(page.locator('#spatial-rail .rail-story')).toBeVisible()
  if(await page.locator('.object-popover').count()){
    await expect(page.locator('.object-popover h3')).not.toBeEmpty()
    await page.keyboard.press('Escape')
    await expect(page.locator('.object-popover')).toHaveCount(0)
  }
})

test('a grounded meta edition shows Meta provenance and consent off by default',async({page})=>{
  let consent:unknown='unset'
  await page.route('**/api/editorial',route=>{
    consent=(route.request().postDataJSON() as {consent:boolean})?.consent??'missing'
    return route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page.getByLabel('Allow AI curation')).not.toBeChecked()
  await submitPrompt(page)
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit 1 of',{timeout:15000})
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI-curated edition · Meta AI')
  expect(consent).toBe(false)
})

test('checking AI curation requests one story with the actual consent value',async({page})=>{
  let seen:{consent?:unknown;editionFormat?:unknown}={}
  await page.route('**/api/editorial',route=>{
    seen=(route.request().postDataJSON() ?? {}) as {consent?:unknown;editionFormat?:unknown}
    return route.fulfill({status:503,json:{error:'AI disabled'}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.getByLabel('Allow AI curation').check()
  await submitPrompt(page)
  await expect(page.getByRole('alert')).toContainText('The article edition could not be composed.',{timeout:15000})
  expect(seen.consent).toBe(true)
  expect(seen.editionFormat).toBe('curio-editorial-article-v1')
})

test('cached meta and deterministic states stay honestly labeled',async({page})=>{
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:true}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('Meta AI (cached)',{timeout:15000})
  await page.unroute('**/api/editorial')
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'deterministic',retrieval:'d1',cached:false,fallbackReason:'consent_missing'}}))
  await page.reload()
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('verified catalog',{timeout:15000})
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI consent off')
})

test('the no-WebGL fallback stays a readable Silver Field edition',async({page})=>{
  await page.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=(function(){return null} as unknown) as typeof HTMLCanvasElement.prototype.getContext})
  await page.route('**/api/editorial',route=>route.fulfill({status:503,json:{error:'AI disabled'}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await expect(page.locator('.spatial-fallback')).toBeVisible()
  await expect(page.getByText('The 3D exhibition needs WebGL')).toBeVisible()
  await expect(page.locator('.spatial-canvas')).toBeHidden()
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.locator('.spatial-fallback article').first()).toBeVisible({timeout:15000})
  await expect(page.locator('.spatial-fallback section')).toContainText('Journey catalog')
})

// Version-pattern publication fixtures for the revocation suite: the same
// grounded records with exact asset-version image IDs, as real D1
// publications carry. Local demo IDs can never revalidate, by design.
type VersionedRecord={id:string;name:string;image:{id:string;path:string}}
const publishedRecords=(groundedItems as VersionedRecord[])
  .map((item,index)=>({...item,image:{...item.image,id:`version-${index.toString(16).padStart(64,'0')}`}}))
const versionPlan=(records:VersionedRecord[])=>({
  title:'A versioned promenade',
  deck:'Published exhibits for the revocation suite.',
  features:records.map((record,index)=>({
    catalogId:record.id,assetId:record.image.id,
    headline:`A closer look ${index+1}`,
    narrative:'A subjective visual reading of the composition and the space between its forms.',
    layout:'hero',motion:'still',theme:'Quiet Luxury',
  })),
})
const publishedRoute=(revoked:()=>string[])=>async(route:Route)=>{
  const ids=new URL(route.request().url()).searchParams.get('ids')?.split(',')??null
  let records=publishedRecords
  if(ids)records=records.filter(record=>ids.includes(record.image.id))
  const gone=new Set(revoked())
  records=records.filter(record=>!gone.has(record.image.id))
  await route.fulfill({status:200,json:{items:records,nextCursor:null}})
}
const stageVersionedEdition=async(page:Page,records:VersionedRecord[])=>{
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:versionPlan(records),items:records,source:'meta',retrieval:'d1',cached:false}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('Meta AI',{timeout:15000})
  await expect(page.getByRole('button',{name:'Journey',exact:true})).toBeEnabled({timeout:15000})
}

test('re-entering journey drops records revoked mid-session',async({page})=>{
  const revoked=new Set<string>()
  await page.route('**/api/catalog/published*',publishedRoute(()=>[...revoked]))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await page.waitForFunction(()=>((window.__spatial?.().nodes)??0)>0)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.waitForTimeout(1800)
  await expect(page.getByRole('navigation',{name:'Journey network'})).toContainText('live catalog')
  expect(await page.evaluate(()=>window.__spatial?.().nodes)).toBe(2)
  revoked.add(publishedRecords[1].image.id)
  await page.getByRole('button',{name:'← Promenade'}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toContainText('1 records')
  expect(await page.evaluate(()=>window.__spatial?.().nodeIds)).toEqual([publishedRecords[0].image.id])
  await expect(page.getByRole('status').last()).toContainText('removed from the journey')
})

test('entering a revoked exhibit stays in journey and prunes it',async({page})=>{
  const revoked=new Set<string>()
  await page.route('**/api/catalog/published*',publishedRoute(()=>[...revoked]))
  await stageVersionedEdition(page,publishedRecords)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.waitForTimeout(1800)
  const target=await page.evaluate(()=>{
    const snapshot=window.__spatial?.()
    return snapshot?.nodeIds.findIndex(id=>snapshot.staged.includes(id))??-1
  })
  expect(target).toBeGreaterThanOrEqual(0)
  for(let i=0;i<=target;i++)await page.getByRole('button',{name:'Next node'}).click()
  const panel=page.getByTestId('spatial-node-panel')
  await expect(panel.getByRole('button',{name:'Enter exhibit →'})).toBeVisible()
  revoked.add(await page.evaluate(index=>window.__spatial?.().nodeIds[index]??'',target))
  await panel.getByRole('button',{name:'Enter exhibit →'}).click()
  await page.waitForFunction(()=>window.__spatial?.().exhibits===1)
  expect(await page.evaluate(()=>window.__spatial?.().mode)).toBe('network')
  expect(await page.evaluate(()=>window.__spatial?.().nodeIds)).toHaveLength(1)
  await expect(panel).toBeHidden()
  await expect(page.locator('p.spatial-sr')).toContainText('no longer available')
})

test('returning to the promenade drops exhibits revoked mid-session',async({page})=>{
  const revoked=new Set<string>()
  await page.route('**/api/catalog/published*',publishedRoute(()=>[...revoked]))
  await stageVersionedEdition(page,publishedRecords)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.waitForTimeout(1800)
  revoked.add(publishedRecords[0].image.id)
  await page.getByRole('button',{name:'← Promenade'}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
  expect(await page.evaluate(()=>window.__spatial?.().exhibits)).toBe(1)
  expect(await page.evaluate(()=>window.__spatial?.().nodeIds)).toHaveLength(1)
  await expect(page.getByRole('status').last()).toContainText('no longer lists')
})

test('unverifiable journey records fall back to the labeled manifest',async({page})=>{
  let calls=0
  await page.route('**/api/catalog/published*',route=>{
    const ids=new URL(route.request().url()).searchParams.get('ids')
    calls++
    if(ids||calls>1)return route.fulfill({status:503,json:{error:'catalog down'}})
    return route.fulfill({status:200,json:{items:publishedRecords,nextCursor:null}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await page.waitForFunction(()=>((window.__spatial?.().nodes)??0)>0)
  expect(await page.evaluate(()=>window.__spatial?.().source)).toBe('published')
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toContainText('local manifest')
  expect(await page.evaluate(()=>window.__spatial?.().nodes)).toBeGreaterThanOrEqual(6)
  await expect(page.getByRole('status').last()).toContainText('could not be verified')
})

test('failed journey revalidation also removes staged server exhibits',async({page})=>{
  let calls=0
  await page.route('**/api/catalog/published*',route=>{
    const ids=new URL(route.request().url()).searchParams.get('ids')
    calls++
    if(ids||calls>1)return route.fulfill({status:503,json:{error:'catalog down'}})
    return route.fulfill({status:200,json:{items:publishedRecords,nextCursor:null}})
  })
  await stageVersionedEdition(page,publishedRecords)
  expect(await page.evaluate(()=>window.__spatial?.().exhibits)).toBe(2)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toContainText('local manifest')
  expect(await page.evaluate(()=>window.__spatial?.().exhibits)).toBe(0)
  await expect(page.getByTestId('spatial-edition-chip')).toBeHidden()
  await expect(page.getByRole('status').last()).toContainText('exhibits were removed')
})

test('failed journey revalidation leaves local demo exhibits alone',async({page})=>{
  let calls=0
  await page.route('**/api/catalog/published*',route=>{
    const ids=new URL(route.request().url()).searchParams.get('ids')
    calls++
    if(ids||calls>1)return route.fulfill({status:503,json:{error:'catalog down'}})
    return route.fulfill({status:200,json:{items:publishedRecords,nextCursor:null}})
  })
  await page.route('**/api/editorial',route=>route.fulfill({status:503,json:{error:'AI disabled'}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await submitPrompt(page)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI not used',{timeout:15000})
  await expect(page.getByRole('button',{name:'Journey',exact:true})).toBeEnabled({timeout:15000})
  const staged=await page.evaluate(()=>window.__spatial?.().exhibits??0)
  expect(staged).toBeGreaterThan(0)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toContainText('local manifest')
  expect(await page.evaluate(()=>window.__spatial?.().exhibits)).toBe(staged)
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI not used')
})

test('artwork that 404s removes its exhibit instead of lingering',async({page})=>{
  await page.route('**/api/catalog/published*',publishedRoute(()=>[]))
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:versionPlan([publishedRecords[0]]),items:[publishedRecords[0]],source:'meta',retrieval:'d1',cached:false}}))
  await page.route(`**${publishedRecords[0].image.path}`,route=>route.fulfill({status:404}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await submitPrompt(page)
  // The staged state flashes by: the 404 prune lands before any stable
  // assertion on it, so the removal message is the deterministic signal.
  await expect(page.getByRole('status').last()).toContainText('no longer lists',{timeout:15000})
  expect(await page.evaluate(()=>window.__spatial?.().exhibits)).toBe(0)
  await expect(page.getByLabel('Your curiosity')).toBeVisible()
  await expect(page.getByTestId('spatial-edition-chip')).toBeHidden()
})

test('assembly honors the director minimum on instant responses',async({page})=>{
  await page.route('**/api/editorial',route=>route.fulfill({status:503,json:{error:'AI disabled'}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  const begun=Date.now()
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByRole('status').first()).toContainText('Composing your exhibition')
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:15000})
  expect(Date.now()-begun).toBeGreaterThanOrEqual(1800)
})

test('slow generation holds with honest elapsed time and no simulated progress',async({page})=>{
  await page.route('**/api/editorial',async route=>{
    await new Promise(resolve=>setTimeout(resolve,4000))
    await route.fulfill({status:503,json:{error:'AI disabled'}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByRole('status').first()).toContainText(/\d+s elapsed/,{timeout:10000})
  await expect(page.getByRole('status').first()).not.toContainText('%')
  const hold=await page.evaluate(()=>window.__spatial?.())
  expect(['stream','lattice']).toContain(hold?.assembly)
  expect(hold?.cameraY??-1).toBeGreaterThan(1.9)
  expect(hold?.cameraY??9).toBeLessThan(2.5)
  await page.waitForTimeout(1200)
  await page.screenshot({path:'test-results/spatial-assembly-1440.png'})
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:15000})
})

test('ai-length headlines and narratives stay readable without overflow',async({page})=>{
  const headline='A closer look at the quiet arrangement of objects within soft northern light levels'
  const sentence='Imagine the visible arrangement inviting a closer look at the space around each form. '
  const narrative=sentence.repeat(4).trim().slice(0,395)
  const longPlan={...metaPlan,features:metaPlan.features.map(feature=>({...feature,headline,narrative}))}
  await page.route('**/api/editorial',route=>route.fulfill({status:200,json:{plan:longPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}}))
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    await page.setViewportSize(viewport)
    await page.goto('/')
    await submitPrompt(page)
    await expect(page.getByTestId('spatial-edition-chip')).toContainText('Meta AI',{timeout:15000})
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight*0.22))
    await expect(page.locator('.spatial-rail')).toBeVisible()
    await expect(page.locator('.spatial-rail-card h2').first()).toContainText('A closer look')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
    await expect(page.getByRole('button',{name:'Journey',exact:true})).toBeVisible()
    const card=page.locator('.spatial-rail-card').first()
    await card.getByRole('button',{name:/^Inspect /}).first().click()
    await expect(card.locator('.object-popover')).toBeVisible()
    await expect(card.locator('.object-popover p').first()).not.toBeEmpty()
    await page.keyboard.press('Escape')
    await expect(card.locator('.object-popover')).toHaveCount(0)
  }
})

test('a slow full-review workflow still stages meta past the old bound',async({page})=>{
  test.setTimeout(90000)
  await page.route('**/api/editorial',async route=>{
    await new Promise(resolve=>setTimeout(resolve,25000))
    await route.fulfill({status:200,json:{plan:metaPlan,items:groundedItems,source:'meta',retrieval:'d1',cached:false}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByRole('status').first()).toContainText(/\d+s elapsed/,{timeout:10000})
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('AI-curated edition · Meta AI',{timeout:45000})
})

test('Clear wipes the visit session and says what was removed',async({page})=>{
  test.setTimeout(90000)
  await page.setViewportSize({width:390,height:844})
  await page.goto('/spatial')
  await page.getByLabel('Your curiosity').fill('Bold garments')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible()
  expect(await page.evaluate(()=>sessionStorage.getItem('curio.spatial.session.v1'))).not.toBeNull()
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.getByRole('button',{name:'Clear',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
  expect(await page.evaluate(()=>sessionStorage.getItem('curio.spatial.session.v1'))).toBeNull()
  await expect(page.getByRole('status').last()).toContainText('curio.spatial.session.v1')
  await expect(page.getByRole('status').last()).toContainText('pending confirmation')
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.getByRole('button',{name:'Clear',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
  await expect(page.getByRole('status').last()).toContainText('No visit data was found in this browser')
  await expect(page.getByLabel('Your curiosity')).toBeVisible()
  await page.screenshot({path:'test-results/spatial-discover-390.png'})
})

async function stageFallbackEdition(page:Page):Promise<void>{
  await page.route('**/api/editorial',route=>route.fulfill({status:503,json:{error:'AI disabled'}}))
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.getByLabel('Your curiosity').fill('A quiet room with soft light')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:15000})
}

async function openJourney(page:Page):Promise<void>{
  await stageFallbackEdition(page)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.waitForTimeout(1800)
}

test('journey opens the network of real catalog nodes',async({page})=>{
  await openJourney(page)
  const snapshot=await page.evaluate(()=>window.__spatial?.())
  expect(snapshot?.nodes).toBeGreaterThanOrEqual(6)
  expect(snapshot?.source).toBe('manifest')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toBeVisible()
  await expect(page.locator('.spatial-crumb')).toContainText('Journey')
  await expect(page.locator('.spatial-rail')).toBeHidden()
  await page.screenshot({path:'test-results/spatial-network-1440.png'})
})

test('orbit drag and wheel zoom move the chamber camera',async({page})=>{
  await openJourney(page)
  const before=await page.evaluate(()=>window.__spatial?.().orbit)
  await page.mouse.move(720,450)
  await page.mouse.down()
  await page.mouse.move(920,450,{steps:10})
  await page.mouse.up()
  await page.mouse.wheel(0,400)
  await page.waitForTimeout(300)
  const after=await page.evaluate(()=>window.__spatial?.().orbit)
  expect(after?.yaw).not.toBeCloseTo(before?.yaw??0,5)
  expect(after?.radius).toBeGreaterThan(before?.radius??0)
})

test('surprise highlights a node without diving',async({page})=>{
  await openJourney(page)
  const orbitBefore=await page.evaluate(()=>window.__spatial?.().orbit)
  await page.getByRole('button',{name:'Surprise me'}).click()
  const snapshot=await page.evaluate(()=>window.__spatial?.())
  expect(snapshot?.mode).toBe('network')
  expect(snapshot?.selected).toBeGreaterThanOrEqual(0)
  const orbitAfter=await page.evaluate(()=>window.__spatial?.().orbit)
  expect(orbitAfter).toEqual(orbitBefore)
  await expect(page.locator('.spatial-crumb')).toContainText('Journey · ')
  await expect(page.getByRole('button',{name:'Close node panel'})).toBeVisible()
})

test('entering a staged node dives to its exhibit',async({page})=>{
  await openJourney(page)
  const target=await page.evaluate(()=>{
    const snapshot=window.__spatial?.()
    return snapshot?.nodeIds.findIndex(id=>snapshot.staged.includes(id))??-1
  })
  expect(target).toBeGreaterThanOrEqual(0)
  for(let i=0;i<=target;i++)await page.getByRole('button',{name:'Next node'}).click()
  const panel=page.getByTestId('spatial-node-panel')
  await expect(panel.getByRole('button',{name:'Enter exhibit →'})).toBeVisible()
  await panel.getByRole('button',{name:'Enter exhibit →'}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
  await expect(page.locator('.spatial-crumb')).toContainText('Exhibit',{timeout:10000})
})

test('curating from an unstaged node starts a new edition',async({page})=>{
  await openJourney(page)
  const target=await page.evaluate(()=>{
    const snapshot=window.__spatial?.()
    return snapshot?.nodeIds.findIndex(id=>!snapshot.staged.includes(id))??-1
  })
  expect(target).toBeGreaterThanOrEqual(0)
  for(let i=0;i<=target;i++)await page.getByRole('button',{name:'Next node'}).click()
  const panel=page.getByTestId('spatial-node-panel')
  await expect(panel.getByRole('button',{name:'Curate from this node →'})).toBeVisible()
  await panel.getByRole('button',{name:'Curate from this node →'}).click()
  await expect(page.getByRole('status').first()).toContainText('Composing your exhibition')
  const snapshot=await page.evaluate(()=>window.__spatial?.())
  expect(snapshot?.mode).toBe('promenade')
})

test('clear from the network exhales and wipes the visit',async({page})=>{
  await openJourney(page)
  expect(await page.evaluate(()=>sessionStorage.getItem('curio.spatial.session.v1'))).not.toBeNull()
  await page.getByRole('button',{name:'Clear',exact:true}).click()
  await page.waitForTimeout(1800)
  expect(await page.evaluate(()=>sessionStorage.getItem('curio.spatial.session.v1'))).toBeNull()
  const snapshot=await page.evaluate(()=>window.__spatial?.())
  expect(snapshot?.mode).toBe('promenade')
  await expect(page.getByLabel('Your curiosity')).toBeVisible()
})

test('reduced-motion journey uses the toolbar and panel',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'})
  await stageFallbackEdition(page)
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await expect(page.getByRole('navigation',{name:'Journey network'})).toBeVisible()
  await page.getByRole('button',{name:'Surprise me'}).click()
  const panel=page.getByTestId('spatial-node-panel')
  await expect(panel).toBeVisible()
  if(await panel.getByRole('button',{name:'Enter exhibit →'}).count()){
    await panel.getByRole('button',{name:'Enter exhibit →'}).click()
  }else{
    await panel.getByRole('button',{name:'Curate from this node →'}).click()
  }
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
})

test('network stays usable at mobile width',async({page})=>{
  test.setTimeout(60000)
  await page.route('**/api/editorial',route=>route.fulfill({status:503,json:{error:'AI disabled'}}))
  await page.setViewportSize({width:390,height:844})
  await page.goto('/spatial')
  await page.getByLabel('Your curiosity').fill('Bold garments')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByTestId('spatial-edition-chip')).toBeVisible({timeout:15000})
  await page.getByRole('button',{name:'Journey',exact:true}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='network')
  await page.waitForTimeout(1800)
  await expect(page.getByRole('navigation',{name:'Journey network'})).toBeVisible()
  await page.getByRole('button',{name:'Surprise me'}).click()
  await expect(page.getByTestId('spatial-node-panel')).toBeVisible()
  await page.screenshot({path:'test-results/spatial-network-390.png'})
  await page.getByRole('button',{name:'← Promenade'}).click()
  await page.waitForFunction(()=>window.__spatial?.().mode==='promenade',{timeout:10000})
})

test('/ is the spatial homepage and /legacy keeps the 2D edition',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
  await expect(page.getByLabel('Your curiosity')).toBeVisible()
  await page.goto('/legacy')
  await expect(page.getByLabel('Your discovery prompt')).toBeVisible()
  await expect(page.getByText('AI not used').first()).toBeHidden()
})

test('/spatial redirects to / for backward compatibility',async({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await expect(page).toHaveURL('http://127.0.0.1:4173/')
  await expect(page.locator('.spatial-canvas')).toBeVisible()
})
