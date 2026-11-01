import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ObjectDiscovery from '../src/spatial/ObjectDiscovery'

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})

// Synthetic contract-shaped fixture; never a Production result.
const versionId=`version-${'c'.repeat(64)}`
const payload={
  catalogId:'test-catalog-01',assetId:versionId,width:800,height:600,
  regions:[
    {id:'cap-1:sam-1',box:{x:0.1,y:0.2,width:0.3,height:0.25},label:'Curved seat',editorialDetail:'A short human-reviewed observation of the curved seat.',product:null,provenance:{origin:'sam_detection',model:'sam-3.1',uncertainty:'model_estimate_not_identity',reviewed:true},confidence:0.9},
    {id:'cap-1:sam-2',box:{x:0.55,y:0.5,width:0.2,height:0.2},label:'Side table',editorialDetail:'A short human-reviewed observation of the side table.',product:{id:'product-test-01',name:'Test Side Table',kind:'owner_mockup'},provenance:{origin:'sam_detection',model:'sam-3.1',uncertainty:'model_estimate_not_identity',reviewed:true},confidence:0.7},
  ],
}
const ok=()=>vi.fn(async()=>({ok:true,json:async()=>payload}) as Response)

it('renders approved regions and opens an honest editorial detail on selection',async()=>{
  vi.stubGlobal('fetch',ok())
  const user=userEvent.setup()
  render(<ObjectDiscovery assetId={versionId} image="/editorial/read/08_ochre_lounge_chair.png" alt="Artwork for testing"/>)
  const first=await screen.findByRole('button',{name:'Inspect Curved seat'})
  expect(first).toHaveProperty('style.left','10%')
  await user.click(first)
  expect(first.getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByText('A short human-reviewed observation of the curved seat.')).toBeTruthy()
  expect(screen.getByText('No product link · visual note only')).toBeTruthy()
  expect(screen.getByText('Reviewed detection · approximate area, not verified product identity.')).toBeTruthy()
  await user.click(await screen.findByRole('button',{name:'Inspect Side table'}))
  expect(screen.getByText('Test Side Table · fictional mockup, not for sale')).toBeTruthy()
  await user.click(screen.getByRole('button',{name:'Inspect Side table'}))
  expect(screen.queryByText('A short human-reviewed observation of the side table.')).toBeNull()
})

it('selects regions from the keyboard',async()=>{
  vi.stubGlobal('fetch',ok())
  const user=userEvent.setup()
  render(<ObjectDiscovery assetId={versionId} image="/x.png" alt="Artwork for testing"/>)
  await screen.findByRole('button',{name:'Inspect Curved seat'})
  await user.tab()
  await user.keyboard('{Enter}')
  expect(await screen.findByText('A short human-reviewed observation of the curved seat.')).toBeTruthy()
})

it('renders nothing for demo IDs without requesting',async()=>{
  const fetch=vi.fn(async()=>({ok:true,json:async()=>payload}) as Response)
  vi.stubGlobal('fetch',fetch)
  const {container}=render(<ObjectDiscovery assetId="curio-owner-08-v1" image="/x.png" alt="Artwork for testing"/>)
  await vi.waitFor(()=>expect(container.innerHTML).toBe(''))
  expect(fetch).not.toHaveBeenCalled()
})

it('hides gracefully on 404, empty sets and image errors',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:false}) as Response))
  const missing=render(<ObjectDiscovery assetId={versionId} image="/x.png" alt="Artwork for testing"/>)
  await vi.waitFor(()=>expect(missing.container.innerHTML).toBe(''))
  missing.unmount()
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({...payload,regions:[]})}) as Response))
  const empty=render(<ObjectDiscovery assetId={versionId} image="/x.png" alt="Artwork for testing"/>)
  await vi.waitFor(()=>expect(empty.container.innerHTML).toBe(''))
  empty.unmount()
  vi.stubGlobal('fetch',ok())
  const broken=render(<ObjectDiscovery assetId={versionId} image="/missing.png" alt="Artwork for testing"/>)
  await screen.findByRole('button',{name:'Inspect Curved seat'})
  fireEvent.error(screen.getByRole('img'))
  expect(broken.container.innerHTML).toBe('')
})
