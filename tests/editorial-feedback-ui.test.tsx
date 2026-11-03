// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import EditorialFeedbackPanel from '../src/EditorialFeedbackPanel'

afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('shows article feedback and refreshes history and draft principles only after confirmed save',async()=>{
 const article={jobId:`article-job-${'b'.repeat(64)}`,id:`article-version-${'a'.repeat(64)}`,generationVersion:`generation-${'c'.repeat(64)}`,headline:'A room for reading',deck:'A considered deck.',narrative:'A considered narrative.',heroAssetId:`version-${'a'.repeat(64)}`,updatedAt:1}
 let saved=false,revised=false
 const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const path=String(input)
  if(path.endsWith('/revisions')&&init?.method==='POST'){revised=true;return Response.json({versionId:`generation-${'d'.repeat(64)}`},{status:201})}
  if(init?.method==='POST'){saved=true;return Response.json({id:'feedback-1'},{status:201})}
  if(path.endsWith('/articles'))return Response.json({articles:[article]})
  if(path.endsWith('/principles'))return Response.json({principles:saved?[{id:'EF-draft',title:'Reader Interest',guidance:'Ask a question.',approved:0,enabled:0,source_feedback_id:'feedback-1'}]:[]})
  if(path.includes('/versions/'))return Response.json({versions:[{versionId:article.generationVersion,parentVersion:null,feedbackId:null,reviewStatus:'original',article,createdAt:1,ownerDecision:null},...(revised?[{versionId:`generation-${'d'.repeat(64)}`,parentVersion:article.generationVersion,feedbackId:'feedback-1',reviewStatus:'confirmed',article:{...article,narrative:'Revised narrative.'},createdAt:2,ownerDecision:null}]:[])]})
  if(path.includes('/feedback/'))return Response.json({feedback:saved?[{id:'feedback-1',decision:'revise',categories_json:'[]',feedback_text:'Ask a question.',generation_version:article.generationVersion,created_at:1}]:[]})
  return Response.json({error:'Unexpected request'},{status:500})
 })
 vi.stubGlobal('fetch',fetcher)
 render(<EditorialFeedbackPanel token="operator-test-token"/>)
 fireEvent.click(await screen.findByRole('button',{name:'A room for reading'}))
 fireEvent.change(await screen.findByLabelText('Feedback'),{target:{value:'Ask a question.'}})
 fireEvent.click(screen.getByLabelText(/Save as Editorial Principle/))
 fireEvent.click(screen.getByRole('button',{name:'Save feedback'}))
 await waitFor(()=>expect(screen.getByText(/Feedback saved. Principle is a draft/)).toBeTruthy())
 expect(screen.getByText(/EF-draft/).textContent).toContain('Reader Interest')
 expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/feedback'),expect.objectContaining({method:'POST'}))
 expect(fetcher.mock.calls.filter(call=>String(call[0]).endsWith('/revisions'))).toHaveLength(0)
 expect(screen.getByRole('button',{name:'Revise This Article'}).hasAttribute('disabled')).toBe(true)
 fireEvent.click(screen.getByLabelText('I consent to this AI revision'))
 fireEvent.click(screen.getByRole('button',{name:'Revise This Article'}))
 await waitFor(()=>expect(revised).toBe(true))
 await waitFor(()=>expect(screen.getAllByText('Revised narrative.').length).toBeGreaterThan(0))
})
