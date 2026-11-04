import {expect,test} from '@playwright/test'
import {articleResponseFixture} from './article-fixtures'

// Progressive Live Meta AI Logs: with the lease owner still generating,
// a concurrent poll surfaces the running invocation as Calling with its
// real model ID, and completion flips the same entry to Completed.
test('live logs show a running call before the edition completes',async({page})=>{
  const calling={id:'call-live-1',model:'muse-wonder-1.0',stage:'chief_editor',attempt:1,startedAt:Date.now(),endedAt:null,status:'calling'}
  const completed={...calling,endedAt:Date.now()+10000,status:'completed',summary:'Drafted: A Room for 1.'}
  let calls=0
  await page.route('**/api/editorial',route=>{
    if(++calls===1)return new Promise(fulfill=>setTimeout(()=>fulfill(route.fulfill({status:200,json:articleResponseFixture({modelCalls:[completed]})})),10000))
    return route.fulfill({status:202,json:{status:'preparing',fallbackReason:'analysis_pending',eligibleImages:6,requiredImages:6,generationStage:'chief_editor',modelCalls:[calling],preparation:{outcome:'reviewing',remainingCandidates:0,processing:0,retryAfterMs:15000}}})
  })
  await page.setViewportSize({width:1440,height:900})
  await page.goto('/spatial')
  await page.getByLabel('Allow AI curation').check()
  await page.getByLabel(/Article edition/).check()
  await page.getByLabel('Your curiosity').fill('Quiet Nordic interiors')
  await page.getByRole('button',{name:'Begin exploration'}).click()
  const log=page.getByRole('region',{name:'Live Meta AI logs'})
  await expect(log).toContainText('muse-wonder-1.0',{timeout:15000})
  await expect(log).toContainText('Calling',{timeout:15000})
  await expect(log).toContainText('Chief Editor',{timeout:15000})
  await expect(page.getByTestId('spatial-edition-chip')).toContainText('Article edition',{timeout:30000})
  await expect(log).toContainText('Completed')
})
