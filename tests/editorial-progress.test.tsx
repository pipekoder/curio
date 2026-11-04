import {afterEach,expect,it} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import EditorialProgress from '../src/spatial/EditorialProgress'
import {createArticleTracker} from '../src/spatial/editorial-progress'

afterEach(()=>cleanup())

it('renders measured and indeterminate bars with honest roles',()=>{
  const tracker=createArticleTracker()
  tracker.poll({outcome:'processing',eligibleImages:2,requiredImages:6,remainingCandidates:4,processing:1,generationStage:null,modelCalls:null})
  render(<EditorialProgress progress={tracker.snapshot()}/>)
  const bars=screen.getAllByRole('progressbar')
  const bar=(label:string)=>bars.find(candidate=>candidate.getAttribute('aria-label')===`${label} progress`)!
  expect(bar('Visual Analysis').getAttribute('aria-valuenow')).toBe('33')
  expect(bar('Image & Catalog Verification').getAttribute('aria-valuenow')).toBe('100')
  expect(bar('Editorial Evidence Preparation').getAttribute('aria-valuenow')).toBeNull()
  expect(screen.getByText('Visual Analysis')).toBeTruthy()
  expect(screen.getAllByText('RUNNING').length).toBeGreaterThan(0)
  expect(screen.getByText('COMPLETE')).toBeTruthy()
  expect(screen.getByText('Preparing visual observations…')).toBeTruthy()
  expect(screen.getByText('2 of 6 images · 1 in progress')).toBeTruthy()
  expect(screen.getByText('1 of 6 stages complete')).toBeTruthy()
})

it('shows failed rows and skips what never started',()=>{
  const tracker=createArticleTracker()
  tracker.finish({ok:false,revised:false,fallbackReason:'insufficient_content'})
  render(<EditorialProgress progress={tracker.snapshot()}/>)
  expect(screen.getAllByText('FAILED').length).toBe(2)
  expect(screen.getAllByText('SKIPPED').length).toBeGreaterThan(0)
  expect(screen.getByText('Generation stopped.')).toBeTruthy()
})

it('renders observed model invocations below the progress bars',()=>{
  const tracker=createArticleTracker()
  tracker.poll({outcome:'reviewing',eligibleImages:6,requiredImages:6,remainingCandidates:0,processing:0,generationStage:'reviewer',modelCalls:[
    {id:'call-1',model:'muse-wonder-1.0',stage:'chief_editor',startedAt:1760000000000,endedAt:1760000018400,status:'completed',summary:'Drafted: A Room for 1.'},
    {id:'call-2',model:'muse-spark-1.3',stage:'reviewer',startedAt:1760000019000,endedAt:null,status:'calling'},
  ]})
  const view=render(<EditorialProgress progress={tracker.snapshot()}/>)
  expect(screen.getByText('Live Meta AI Logs')).toBeTruthy()
  const text=view.container.textContent??''
  expect(text).toContain('muse-wonder-1.0')
  expect(text).toContain('muse-spark-1.3')
  expect(text).toContain('Completed')
  expect(text).toContain('Calling')
  expect(text).toContain('18.4s')
  expect(text).toContain('Chief Editor')
  expect(text).toContain('Drafted: A Room for 1.')
  expect(text).toContain('Reviewing the draft against the evidence.')
  expect(text).toContain(new Date(1760000000000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'}))
  // The log section sits below the progress bars.
  expect(text.indexOf('Story Ready')).toBeLessThan(text.indexOf('Live Meta AI Logs'))
})

it('hides the live log section when no invocations were observed',()=>{
  const tracker=createArticleTracker()
  tracker.poll({outcome:'processing',eligibleImages:2,requiredImages:6,remainingCandidates:4,processing:1,generationStage:null,modelCalls:null})
  render(<EditorialProgress progress={tracker.snapshot()}/>)
  expect(screen.queryByText('Live Meta AI Logs')).toBeNull()
})
