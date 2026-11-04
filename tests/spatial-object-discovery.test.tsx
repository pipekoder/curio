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
const authored=[{id:'demo-prod-1',label:'Arc Chair',x:0.5,y:0.5,productName:'Ochre Arc Chair',brandName:'Demo Studio',priceUsd:1200,assumptions:['Assumption one']}]
const ok=()=>vi.fn(async(_url:string)=>({ok:true,json:async()=>payload}) as Response)

it('renders dot markers at box centers and opens one anchored popover at a time',async()=>{
  const fetch=ok()
  vi.stubGlobal('fetch',fetch)
  const user=userEvent.setup()
  render(<ObjectDiscovery assetId={versionId} image="/editorial/read/08_ochre_lounge_chair.png" alt="Artwork for testing" authored={[]}/>)
  const first=await screen.findByRole('button',{name:'Inspect Curved seat'})
  expect(first).toHaveProperty('style.left','25%')
  expect(first).toHaveProperty('style.top','32.5%')
  expect(fetch).toHaveBeenCalledOnce()
  expect(String(fetch.mock.calls[0][0])).toContain('/api/catalog/object-regions/')
  await user.click(first)
  expect(first.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByRole('dialog',{name:'Curved seat'})).toBeTruthy()
  expect(screen.getByText('A short human-reviewed observation of the curved seat.')).toBeTruthy()
  expect(screen.getByText('No product link · visual note only')).toBeTruthy()
  expect(screen.getByText('Reviewed detection · approximate area, not verified product identity.')).toBeTruthy()
  await user.click(await screen.findByRole('button',{name:'Inspect Side table'}))
  expect(screen.queryByText('A short human-reviewed observation of the curved seat.')).toBeNull()
  expect(screen.getByText('Test Side Table · fictional mockup, not for sale')).toBeTruthy()
  await user.click(screen.getByRole('button',{name:'Inspect Side table'}))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(fetch).toHaveBeenCalledOnce()
})

it('selects markers from the keyboard and closes with Escape',async()=>{
  vi.stubGlobal('fetch',ok())
  const user=userEvent.setup()
  render(<ObjectDiscovery assetId={versionId} image="/x.png" alt="Artwork for testing" authored={[]}/>)
  const first=await screen.findByRole('button',{name:'Inspect Curved seat'})
  await user.tab()
  expect(document.activeElement).toBe(first)
  await user.keyboard('{Enter}')
  expect(await screen.findByText('A short human-reviewed observation of the curved seat.')).toBeTruthy()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(first)
})

it('closes the popover on outside click and returns focus to the marker',async()=>{
  vi.stubGlobal('fetch',ok())
  const user=userEvent.setup()
  const {container}=render(<ObjectDiscovery assetId={versionId} image="/x.png" alt="Artwork for testing" authored={[]}/>)
  const first=await screen.findByRole('button',{name:'Inspect Curved seat'})
  await user.click(first)
  expect(await screen.findByRole('dialog')).toBeTruthy()
  await user.click(screen.getByRole('button',{name:'Close object details'}))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(first)
  await user.click(first)
  expect(await screen.findByRole('dialog')).toBeTruthy()
  fireEvent.click(document.querySelector('.object-catcher')!)
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('portals the popover outside clipped ancestors with viewport coordinates',async()=>{
  vi.stubGlobal('fetch',ok())
  const user=userEvent.setup()
  const {container}=render(<ObjectDiscovery assetId={versionId} image="/x.png" alt="Artwork for testing" authored={[]}/>)
  await user.click(await screen.findByRole('button',{name:'Inspect Curved seat'}))
  const popover=await screen.findByRole('dialog',{name:'Curved seat'})
  expect(container.querySelector('.object-popover')).toBeNull()
  expect(popover.parentElement).toBe(document.body)
  expect(popover.className).toContain('is-floating')
  expect(popover.style.getPropertyValue('--pop-left')).toMatch(/^-?\d+px$/)
  expect(popover.style.getPropertyValue('--pop-top')).toMatch(/^-?\d+px$/)
})

it('renders authored markers with honest demo detail and no duplicate for the same object',async()=>{
  vi.stubGlobal('fetch',ok())
  const user=userEvent.setup()
  render(<ObjectDiscovery assetId="curio-owner-08-v1" image="/x.png" alt="Artwork for testing" authored={authored}/>)
  await user.click(await screen.findByRole('button',{name:'Inspect Arc Chair'}))
  expect(screen.getByRole('dialog',{name:'Ochre Arc Chair'})).toBeTruthy()
  expect(screen.getByText('Demo Studio · unverified · fictional, not for sale')).toBeTruthy()
  expect(screen.getByText('Manually authored hotspot · no SAM inference. Material and specifications unverified.')).toBeTruthy()
})

it('drops a SAM anchor that duplicates an authored point',async()=>{
  vi.stubGlobal('fetch',ok())
  render(<ObjectDiscovery assetId={versionId} image="/x.png" alt="Artwork for testing"
    authored={[{...authored[0],x:0.25,y:0.325}]}/>)
  await screen.findByRole('button',{name:'Inspect Arc Chair'})
  expect(screen.queryByRole('button',{name:'Inspect Curved seat'})).toBeNull()
  expect(screen.getByRole('button',{name:'Inspect Side table'})).toBeTruthy()
})

it('opens a spotlighted hotspot once, then consumes it',async()=>{
  vi.stubGlobal('fetch',ok())
  const consume=vi.fn()
  render(<ObjectDiscovery assetId={versionId} image="/x.png" alt="Artwork for testing" authored={[]}
    initialSelectedId="cap-1:sam-2" onConsumeSpotlight={consume}/>)
  expect(await screen.findByText('A short human-reviewed observation of the side table.')).toBeTruthy()
  expect(consume).toHaveBeenCalledOnce()
})

it('shows the image but no markers for demo IDs without requesting',async()=>{
  const fetch=vi.fn(async()=>({ok:true,json:async()=>payload}) as Response)
  vi.stubGlobal('fetch',fetch)
  render(<ObjectDiscovery assetId="curio-owner-08-v1" image="/x.png" alt="Artwork for testing" authored={[]}/>)
  expect(await screen.findByRole('img')).toBeTruthy()
  await vi.waitFor(()=>expect(screen.queryByRole('button',{name:/Inspect/})).toBeNull())
  expect(fetch).not.toHaveBeenCalled()
})

it('hides markers gracefully on 404 and empty sets, and the figure on image errors',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:false}) as Response))
  const missing=render(<ObjectDiscovery assetId={versionId} image="/x.png" alt="Artwork for testing" authored={[]}/>)
  expect(await missing.findByRole('img')).toBeTruthy()
  await vi.waitFor(()=>expect(missing.queryByRole('button',{name:/Inspect/})).toBeNull())
  missing.unmount()
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({...payload,regions:[]})}) as Response))
  const empty=render(<ObjectDiscovery assetId={versionId} image="/x.png" alt="Artwork for testing" authored={[]}/>)
  expect(await empty.findByRole('img')).toBeTruthy()
  await vi.waitFor(()=>expect(empty.queryByRole('button',{name:/Inspect/})).toBeNull())
  empty.unmount()
  vi.stubGlobal('fetch',ok())
  const broken=render(<ObjectDiscovery assetId={versionId} image="/missing.png" alt="Artwork for testing" authored={[]}/>)
  await broken.findByRole('button',{name:'Inspect Curved seat'})
  fireEvent.error(broken.getByRole('img'))
  expect(broken.container.innerHTML).toBe('')
})

it('shows automatic hotspots as catalog name plus description sentence only',async()=>{
  const auto={...payload,regions:[{id:'job-1:0',box:{x:0.3,y:0.4,width:0.2,height:0.2},label:'Ceramic Vase',editorialDetail:'A wheel-thrown vase with a matte glaze.',product:{id:'product-1',name:'Ceramic Vase',kind:'owner_mockup'},provenance:{origin:'sam_hotspot',model:'sam-3.1',uncertainty:'system_validated_estimate',reviewed:false},confidence:0.8}]}
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>auto}) as Response))
  const user=userEvent.setup()
  render(<ObjectDiscovery assetId={versionId} image="/x.png" alt="Artwork for testing" authored={[]}/>)
  await user.click(await screen.findByRole('button',{name:'Inspect Ceramic Vase'}))
  expect(screen.getByRole('heading',{name:'Ceramic Vase'})).toBeTruthy()
  expect(screen.getByText('A wheel-thrown vase with a matte glaze.')).toBeTruthy()
  expect(screen.queryByText(/Reviewed detection/)).toBeNull()
  expect(screen.queryByText(/fictional mockup/)).toBeNull()
})
