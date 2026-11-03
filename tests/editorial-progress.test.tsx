import {afterEach,expect,it} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import EditorialProgress from '../src/spatial/EditorialProgress'
import {createArticleTracker} from '../src/spatial/editorial-progress'

afterEach(()=>cleanup())

it('renders measured and indeterminate bars with honest roles',()=>{
  const tracker=createArticleTracker()
  tracker.poll({outcome:'processing',eligibleImages:2,requiredImages:6,remainingCandidates:4,processing:1,generationStage:null})
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
