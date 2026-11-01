import {afterEach,expect,it,vi} from 'vitest'
import {researchPublicSources} from '../worker/cultural-research'
import {catalogApi} from '../worker/catalog-api'

const origin='https://museum.example',query='chair design history'
afterEach(()=>vi.unstubAllGlobals())
it('collects bounded, relevant external evidence with provenance but no automatic factual approval',async()=>{
 const fetcher=vi.fn(async()=>new Response('<html><script>ignore this</script><article>Chair design history is debated. The chair was shown in a gallery.</article></html>',{headers:{'Content-Type':'text/html'}})) as unknown as typeof fetch
 const result=await researchPublicSources({query,urls:[`${origin}/chairs`,`${origin}/chairs`],quote:'Chair design history is debated.'},origin,{fetcher})
 expect(fetcher).toHaveBeenCalledTimes(1)
 expect(result.sources).toEqual([expect.objectContaining({url:`${origin}/chairs`,origin,verification:'pending',quoteMatch:'text_match_only_not_rights_verified',attribution:{author:null,publishedAt:null},sha256:expect.stringMatching(/^[a-f0-9]{64}$/)})])
 expect(result.sources[0].excerpt).not.toContain('ignore this')
 expect(result.modelCalls).toBe(0)
})
it('rejects non-allowlisted hosts, redirects, oversized content and absent quotation matches',async()=>{
 const fetcher=vi.fn(async()=>new Response('Chair design history.',{headers:{'Content-Type':'text/plain'}})) as unknown as typeof fetch
 await expect(researchPublicSources({query,urls:['https://other.example/']},origin,{fetcher})).rejects.toThrow(/allowlisted/)
 await expect(researchPublicSources({query,urls:[`${origin}/go`]},origin,{fetcher:vi.fn(async()=>new Response(null,{status:302,headers:{Location:'https://other.example'}})) as unknown as typeof fetch})).rejects.toThrow()
 await expect(researchPublicSources({query,urls:[`${origin}/large`]},origin,{fetcher:vi.fn(async()=>new Response('x'.repeat(131073),{headers:{'Content-Type':'text/plain'}})) as unknown as typeof fetch})).rejects.toThrow(/bound/)
 const result=await researchPublicSources({query,urls:[`${origin}/chairs`],quote:'Invented quotation'},origin,{fetcher})
 expect(result.sources[0].quoteMatch).toBe('not_found')
})
it('is default-off and rejects unauthenticated operator requests',async()=>{
 const token='test-operator-token-longer-than-32-characters',env={CATALOG_DB:{} as D1Database,CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,PUBLIC_APP_ORIGIN:'https://curio.test'}
 const request=(authorization:string)=>catalogApi.request('https://curio.test/research',{method:'POST',headers:{Origin:'https://curio.test','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',Authorization:authorization},body:JSON.stringify({query,urls:[`${origin}/chairs`]})},env)
 expect((await request('Bearer wrong')).status).toBe(403)
 expect((await request(`Bearer ${token}`)).status).toBe(503)
})
