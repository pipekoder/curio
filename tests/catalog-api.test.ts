// @vitest-environment node
import { expect, it } from 'vitest'
import { catalogApi } from '../worker/catalog-api'
import app from '../worker/index'
const token = 'test-only-private-token-more-than-32-characters'
const env = { CATALOG_OPERATOR_ENABLED: 'true', CATALOG_OPERATOR_TOKEN: token, PUBLIC_APP_ORIGIN: 'https://curio.test', CATALOG_DB: {} as D1Database }
const headers = { Authorization: `Bearer ${token}`, Origin: 'https://curio.test', 'CF-Connecting-IP': '192.0.2.1' }
it.each([
  { Authorization: '' }, { Authorization: 'Bearer incorrect' }, { Authorization: 'x'.repeat(513) },
  { Origin: '' }, { Origin: 'https://evil.example' },
  { 'CF-Connecting-IP': '' }, { 'CF-Connecting-IP': 'x'.repeat(65) },
])('rejects invalid operator credentials/origin/trusted address before D1 access: %j', async extra => {
  const response = await catalogApi.request('https://curio.test/status', { headers: { ...headers, ...extra } }, env)
  expect(response.status).toBe(403)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})
it.each([{ CATALOG_OPERATOR_ENABLED: 'false' }, { CATALOG_OPERATOR_TOKEN: 'short' }, { CATALOG_DB: undefined }])('fails closed for unavailable private catalog: %j', async extra => {
  expect((await catalogApi.request('https://curio.test/status', { headers }, { ...env, ...extra })).status).toBe(503)
})

const readiness='/intelligence/pilot/readiness'
const browserGet={Authorization:`Bearer ${token}`,'CF-Connecting-IP':'192.0.2.1','Sec-Fetch-Site':'same-origin',Referer:'https://curio.test/internal/media'}
it('accepts the authenticated readiness GET with explicit or verified same-origin browser context',async()=>{
  for(const authorized of [headers,browserGet]){
    const response=await catalogApi.request(`https://curio.test${readiness}`,{headers:authorized},env)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toMatchObject({configured:false,ready:false,reason:'exactly_six_version_ids_required'})
  }
})
it('mounts the authenticated readiness route at the Production path',async()=>{
  const response=await app.request(`https://curio.test/api/operator/catalog${readiness}`,{headers:browserGet},env)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({configured:false,ready:false})
})
it('denies absent, invalid or cross-origin browser credentials and context',async()=>{
  const rejected=[
    {...browserGet,Authorization:''},
    {...browserGet,Authorization:'Bearer incorrect'},
    {...browserGet,'Sec-Fetch-Site':'cross-site'},
    {...browserGet,Referer:'https://evil.example/internal/media'},
    {...browserGet,Origin:'https://evil.example'},
    {Authorization:`Bearer ${token}`,'CF-Connecting-IP':'192.0.2.1',Referer:'https://curio.test/internal/media'},
    {Authorization:`Bearer ${token}`,'CF-Connecting-IP':'192.0.2.1','Sec-Fetch-Site':'same-origin'},
  ]
  for(const denied of rejected){
    const response=await catalogApi.request(`https://curio.test${readiness}`,{headers:new Headers(Object.entries(denied).filter((entry): entry is [string,string]=>typeof entry[1]==='string'))},env)
    expect(response.status).toBe(403)
  }
})
it('requires explicit matching Origin and JSON for Catalog writes',async()=>{
  const path='https://curio.test/imports'
  const request={method:'POST',headers:{...browserGet,'Content-Type':'application/json'},body:'{}'}
  expect((await catalogApi.request(path,request,env)).status).toBe(403)
  expect((await catalogApi.request(path,{...request,headers:{...browserGet,Origin:'https://evil.example','Content-Type':'application/json'}},env)).status).toBe(403)
  expect((await catalogApi.request(path,{...request,headers:{...browserGet,Origin:'https://curio.test','Content-Type':'text/plain'}},env)).status).toBe(415)
})
