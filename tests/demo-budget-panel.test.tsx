// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,waitFor,cleanup} from '@testing-library/react'
import DemoBudgetPanel from '../src/DemoBudgetPanel'

const status=(enabled:boolean,used=8)=>({demoTesting:{enabled,authenticated:true,active:enabled},lifetime:{total:500,used:40,remaining:460},day:{total:160,used:20,remaining:140,resetAt:'2026-11-02T00:00:00Z'},perIp:{hourly:{used:4,resetAt:'2026-11-01T09:00:00Z'}},...(enabled?{demoTestingWindow:{limit:12,used,remaining:12-used,resetAt:'2026-11-01T08:15:00Z'}}:{})})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})

it('shows the action only with Demo Testing Mode and refreshes usage after confirmed reset',async()=>{
 let reads=0
 const send=vi.fn(async(_url:string,init:RequestInit)=>{
  if(init.method==='POST')return Response.json({resetApplied:true,globalLimitBlocking:null})
  reads++
  return Response.json(status(true,reads===1?8:0))
 })
 vi.stubGlobal('fetch',send)
 vi.spyOn(window,'confirm').mockReturnValue(true)
 render(<DemoBudgetPanel token="operator-test-token-at-least-32-bytes"/>)
 const button=await screen.findByRole('button',{name:'Reset Demo Usage'})
 expect(screen.getByText('8 / 12 units')).toBeTruthy()
 fireEvent.click(button)
 await waitFor(()=>expect(screen.getByText('0 / 12 units')).toBeTruthy())
 expect(screen.getByRole('status').textContent).toContain('Demo usage reset')
 expect(send.mock.calls.map(([,init])=>init.method)).toEqual(['GET','POST','GET'])
 expect(window.confirm).toHaveBeenCalledWith('Reset your current Demo testing rate limits? Daily and lifetime usage will remain unchanged.')
})

it('hides reset when inactive and reports a safe API error without claiming success',async()=>{
 const send=vi.fn(async(_url:string,init:RequestInit)=>init.method==='POST'?Response.json({error:'Demo usage reset unavailable.'},{status:503}):Response.json(status(false)))
 vi.stubGlobal('fetch',send)
 const inactive=render(<DemoBudgetPanel token="operator-test-token-at-least-32-bytes"/>)
 await screen.findByText('Inactive')
 expect(screen.queryByRole('button',{name:'Reset Demo Usage'})).toBeNull()
 inactive.unmount()
 send.mockImplementation(async(_url:string,init:RequestInit)=>init.method==='POST'?Response.json({error:'Demo usage reset unavailable.'},{status:503}):Response.json(status(true)))
 vi.spyOn(window,'confirm').mockReturnValue(true)
 render(<DemoBudgetPanel token="operator-test-token-at-least-32-bytes"/>)
 fireEvent.click(await screen.findByRole('button',{name:'Reset Demo Usage'}))
 expect((await screen.findByRole('alert')).textContent).toContain('Demo usage reset unavailable.')
 expect(screen.queryByRole('status')).toBeNull()
})
