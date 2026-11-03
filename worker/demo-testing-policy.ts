import {z} from 'zod'
import type {Bindings} from './index'

// Fixed UTC windows use the existing counter table and expire without resetting
// shared lifetime/day charges. Values are deliberately below the Demo caps.
export const demoTestingPolicy=z.strictObject({windowSeconds:z.number().int().min(300).max(3600),windowUnits:z.number().int().min(4).max(24).refine(value=>value%4===0)})
export type DemoTestingPolicy=z.infer<typeof demoTestingPolicy>

export function resolveDemoTestingPolicy(env:Bindings):DemoTestingPolicy|null{
  const mode=env.DEMO_TESTING_MODE
  if(mode!==undefined&&mode!=='true'&&mode!=='false')throw Error('Invalid Demo Testing Mode')
  const integer=(raw:string|undefined,fallback:number)=>{
    if(raw===undefined)return fallback
    if(!/^[1-9][0-9]*$/.test(raw))throw Error('Invalid Demo Testing configuration')
    return Number(raw)
  }
  const parsed=demoTestingPolicy.safeParse({windowSeconds:integer(env.DEMO_TESTING_WINDOW_SECONDS,900),windowUnits:integer(env.DEMO_TESTING_WINDOW_UNITS,12)})
  if(!parsed.success)throw Error('Invalid Demo Testing configuration')
  return mode==='true'?parsed.data:null
}
