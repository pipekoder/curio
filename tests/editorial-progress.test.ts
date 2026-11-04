import {expect,it} from 'vitest'
import {createArticleTracker,createStandardTracker,stageTone,type ProgressSnapshot} from '../src/spatial/editorial-progress'
import type {ArticlePoll} from '../src/spatial/articles'

const poll=(over:Partial<ArticlePoll>={}):ArticlePoll=>({outcome:null,eligibleImages:null,requiredImages:null,remainingCandidates:null,processing:null,generationStage:null,...over})
const statusOf=(snap:ProgressSnapshot,id:string)=>snap.stages.find(stage=>stage.id===id)?.status
const rowOf=(snap:ProgressSnapshot,id:string)=>snap.stages.find(stage=>stage.id===id)!

it('starts with verification running and conditional rows hidden',()=>{
  const snap=createArticleTracker().snapshot()
  expect(statusOf(snap,'verify')).toBe('RUNNING')
  expect(statusOf(snap,'analyze')).toBe('QUEUED')
  expect(statusOf(snap,'story')).toBe('QUEUED')
  expect(snap.stages.some(stage=>stage.id==='revision')).toBe(false)
  expect(snap.stages.some(stage=>stage.id==='confirm')).toBe(false)
  expect(snap).toMatchObject({done:0,total:6})
  expect(snap.events).toHaveLength(1)
})

it('tracks measured image analysis without duplicating feed entries',()=>{
  const tracker=createArticleTracker()
  const first=tracker.poll(poll({outcome:'processing',eligibleImages:2,requiredImages:6,remainingCandidates:4,processing:1}))
  expect(statusOf(first,'verify')).toBe('COMPLETE')
  expect(rowOf(first,'analyze')).toMatchObject({status:'RUNNING',fraction:2/6,meta:'2 of 6 images · 1 in progress'})
  expect(stageTone(rowOf(first,'analyze'))).toBe('running')
  const events=first.events.length
  const second=tracker.poll(poll({outcome:'processing',eligibleImages:5,requiredImages:6,remainingCandidates:1,processing:1}))
  expect(rowOf(second,'analyze')).toMatchObject({status:'RUNNING',fraction:5/6})
  expect(stageTone(rowOf(second,'analyze'))).toBe('advancing')
  expect(second.events.length).toBe(events)
})

it('completes analysis at the ready threshold and notes capacity once',()=>{
  const tracker=createArticleTracker()
  tracker.poll(poll({outcome:'processing',eligibleImages:2,requiredImages:6}))
  const ready=tracker.poll(poll({outcome:'evidence_ready',eligibleImages:6,requiredImages:6,remainingCandidates:0,processing:0}))
  expect(statusOf(ready,'analyze')).toBe('COMPLETE')
  expect(statusOf(ready,'evidence')).toBe('QUEUED')
  const waiting=tracker.poll(poll({outcome:'waiting_for_capacity',eligibleImages:6,requiredImages:6}))
  expect(waiting.events.filter(event=>event.text==='Waiting for review capacity…')).toHaveLength(1)
  expect(tracker.poll(poll({outcome:'waiting_for_capacity',eligibleImages:6,requiredImages:6})).events.filter(event=>event.text==='Waiting for review capacity…')).toHaveLength(1)
})

it('advances generation stages monotonically and completes what they pass',()=>{
  const tracker=createArticleTracker()
  tracker.poll(poll({outcome:'reviewing',eligibleImages:6,requiredImages:6}))
  expect(statusOf(tracker.snapshot(),'evidence')).toBe('RUNNING')
  tracker.poll(poll({outcome:'reviewing',eligibleImages:6,requiredImages:6,generationStage:'reviewer'}))
  const snap=tracker.snapshot()
  expect(statusOf(snap,'evidence')).toBe('RUNNING')
  expect(statusOf(snap,'chief')).toBe('COMPLETE')
  expect(statusOf(snap,'review')).toBe('RUNNING')
  expect(snap.events.map(event=>event.text)).toContain('Chief Editor finished the draft.')
  const before=tracker.snapshot()
  tracker.poll(poll({outcome:'reviewing',generationStage:'chief_editor'}))
  expect(tracker.snapshot()).toEqual(before)
})

it('reveals revision rows only when the revision stage is observed',()=>{
  const tracker=createArticleTracker()
  tracker.poll(poll({outcome:'reviewing',generationStage:'revision'}))
  const snap=tracker.snapshot()
  expect(snap.stages.some(stage=>stage.id==='revision')).toBe(true)
  expect(statusOf(snap,'revision')).toBe('RUNNING')
  expect(statusOf(snap,'review')).toBe('COMPLETE')
  expect(snap.events.map(event=>event.text)).toContain('Reviewer requested revisions.')
  expect(snap.stages.some(stage=>stage.id==='confirm')).toBe(false)
})

it('completes a clean edition with measured evidence',()=>{
  const tracker=createArticleTracker()
  tracker.poll(poll({outcome:'processing',eligibleImages:2,requiredImages:6}))
  const snap=tracker.finish({ok:true,staged:true,evidence:{interpretations:5},revised:false})
  expect(rowOf(snap,'evidence')).toMatchObject({status:'COMPLETE',meta:'5 observations'})
  expect(statusOf(snap,'chief')).toBe('COMPLETE')
  expect(statusOf(snap,'review')).toBe('COMPLETE')
  expect(statusOf(snap,'story')).toBe('COMPLETE')
  expect(snap.stages.some(stage=>stage.id==='revision')).toBe(false)
  expect(snap).toMatchObject({done:6,total:6})
  expect(snap.events.map(event=>event.text)).toContain('Your story is ready.')
})

it('marks evidence skipped when the direct path never builds it',()=>{
  const tracker=createArticleTracker()
  const snap=tracker.finish({ok:true,staged:true,evidence:null,revised:false})
  expect(statusOf(snap,'evidence')).toBe('SKIPPED')
  expect(statusOf(snap,'story')).toBe('COMPLETE')
})

it('completes cached replays without inventing an evidence count',()=>{
  const tracker=createArticleTracker()
  const snap=tracker.finish({ok:true,staged:true,evidence:undefined,revised:false})
  expect(rowOf(snap,'evidence')).toMatchObject({status:'COMPLETE',meta:null})
})

it('reveals revision and confirmation from the completion metadata',()=>{
  const tracker=createArticleTracker()
  const snap=tracker.finish({ok:true,staged:true,evidence:{interpretations:3},revised:true})
  expect(statusOf(snap,'revision')).toBe('COMPLETE')
  expect(statusOf(snap,'confirm')).toBe('COMPLETE')
  expect(snap).toMatchObject({done:8,total:8})
  expect(snap.events.map(event=>event.text)).toContain('Final editorial review complete.')
})

it('maps insufficient content to the analysis row',()=>{
  const tracker=createArticleTracker()
  tracker.poll(poll({outcome:'processing',eligibleImages:2,requiredImages:6}))
  const snap=tracker.finish({ok:false,revised:false,fallbackReason:'insufficient_content'})
  expect(statusOf(snap,'verify')).toBe('COMPLETE')
  expect(statusOf(snap,'analyze')).toBe('FAILED')
  expect(statusOf(snap,'evidence')).toBe('SKIPPED')
  expect(statusOf(snap,'chief')).toBe('SKIPPED')
  expect(statusOf(snap,'story')).toBe('FAILED')
})

it('maps an evidence failure past completed analysis',()=>{
  const tracker=createArticleTracker()
  const snap=tracker.finish({ok:false,revised:false,fallbackReason:'evidence_unavailable'})
  expect(statusOf(snap,'analyze')).toBe('COMPLETE')
  expect(statusOf(snap,'evidence')).toBe('FAILED')
  expect(statusOf(snap,'chief')).toBe('SKIPPED')
  expect(statusOf(snap,'story')).toBe('FAILED')
})

it('maps a reviewer validation failure with earlier work complete',()=>{
  const tracker=createArticleTracker()
  const snap=tracker.finish({ok:false,revised:false,failureStage:'reviewer',fallbackReason:'provider_or_validation'})
  expect(statusOf(snap,'chief')).toBe('COMPLETE')
  expect(statusOf(snap,'review')).toBe('FAILED')
  expect(statusOf(snap,'story')).toBe('FAILED')
})

it('freezes rows on budget stops and poll timeouts instead of inventing failure',()=>{
  const tracker=createArticleTracker()
  tracker.poll(poll({outcome:'reviewing',generationStage:'chief_editor'}))
  const budget=tracker.finish({ok:false,revised:false,fallbackReason:'budget'})
  expect(statusOf(budget,'chief')).toBe('RUNNING')
  expect(statusOf(budget,'story')).toBe('FAILED')
  expect(budget.events.map(event=>event.text)).toContain('Stopped: inference budget reached.')
  const paused=createArticleTracker()
  paused.poll(poll({outcome:'processing',eligibleImages:2,requiredImages:6}))
  const frozen=paused.finish({ok:false,revised:false,fallbackReason:'preparing',frozen:true})
  expect(statusOf(frozen,'analyze')).toBe('RUNNING')
  expect(statusOf(frozen,'story')).toBe('QUEUED')
  expect(frozen.events.map(event=>event.text)).toContain('Stopped waiting for the editorial team.')
})

it('tracks the standard flow with two honest rows',()=>{
  const tracker=createStandardTracker()
  expect(tracker.snapshot().stages.map(stage=>stage.status)).toEqual(['RUNNING','RUNNING'])
  const meta=tracker.finish('meta')
  expect(meta).toMatchObject({done:2,total:2})
  expect(meta.events.map(event=>event.text)).toEqual(['Curating your exhibition…','AI curation complete.','Your exhibition is ready.'])
  const plain=createStandardTracker().finish('deterministic')
  expect(plain.events.map(event=>event.text)).toEqual(['Curating your exhibition…','Your exhibition is ready.'])
})

it('tones bars from status and measured fraction',()=>{
  const row=(status:'QUEUED'|'RUNNING'|'COMPLETE'|'FAILED'|'SKIPPED',fraction:number|null)=>({id:'x',label:'X',status,meta:null,fraction})
  expect(stageTone(row('QUEUED',null))).toBe('waiting')
  expect(stageTone(row('SKIPPED',null))).toBe('waiting')
  expect(stageTone(row('RUNNING',null))).toBe('running')
  expect(stageTone(row('RUNNING',0.2))).toBe('running')
  expect(stageTone(row('RUNNING',0.7))).toBe('advancing')
  expect(stageTone(row('COMPLETE',1))).toBe('complete')
  expect(stageTone(row('FAILED',0.3))).toBe('failed')
})
