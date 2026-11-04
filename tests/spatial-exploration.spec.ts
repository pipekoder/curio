import {expect,test} from '@playwright/test'
import {articleResponseFixture} from './article-fixtures'

// Fresh exploration identity: every deliberate Begin Exploration mints a
// new explorationId so the backend runs the models again, while polls,
// retries and reload-resume reuse the ID and resolve to the same D1 job.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

test('a repeated prompt starts a fresh exploration with a new id',async({page})=>{
  const bodies:Record<string,unknown>[]=[]
  await page.route('**/api/editorial',route=>{bodies.push(route.request().postDataJSON() as Record<string,unknown>);return route.fulfill({status:200,json:articleResponseFixture()})})
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.getByLabel('Allow AI curation').check()
  await page.getByLabel(/Article edition/).check()
  await page.getByLabel('Your curiosity').fill('Quiet Nordic interiors')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('Article edition',{timeout:15000})
  await page.getByRole('button',{name:'New Discovery'}).click()
  await page.getByLabel('Your curiosity').fill('Quiet Nordic interiors')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('Article edition',{timeout:15000})
  expect(bodies).toHaveLength(2)
  expect(bodies[0].explorationId).toMatch(uuid)
  expect(bodies[1].explorationId).toMatch(uuid)
  expect(bodies[1].explorationId).not.toBe(bodies[0].explorationId)
})

test('a reload resumes the interrupted exploration with the same id',async({page})=>{
  const bodies:Record<string,unknown>[]=[]
  let hangFirst=true
  await page.route('**/api/editorial',route=>{
    bodies.push(route.request().postDataJSON() as Record<string,unknown>)
    if(hangFirst){hangFirst=false;return new Promise(()=>{})}
    return route.fulfill({status:200,json:articleResponseFixture()})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.getByLabel('Allow AI curation').check()
  await page.getByLabel(/Article edition/).check()
  await page.getByLabel('Your curiosity').fill('Japanese ceramic rituals')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect.poll(()=>bodies.length).toBe(1)
  const before=bodies[0].explorationId
  expect(before).toMatch(uuid)
  await page.reload()
  await expect(page.getByLabel('Your curiosity')).toHaveValue('Japanese ceramic rituals')
  await expect(page.getByLabel(/Article edition/)).toBeChecked()
  await expect(page.getByLabel('Allow AI curation')).not.toBeChecked()
  await expect(page.getByRole('status').first()).toContainText('interrupted')
  await page.getByLabel('Allow AI curation').check()
  await page.getByRole('button',{name:'Begin exploration'}).click()
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('Article edition',{timeout:15000})
  expect(bodies).toHaveLength(2)
  expect(bodies[1].explorationId).toBe(before)
})
