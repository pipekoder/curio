// @vitest-environment node
import {expect,it} from 'vitest'
import app from '../worker/index'
it('keeps publication and ingestion disabled without explicit independent local configuration',async()=>{
 const response=await app.request('/api/catalog/published')
 expect(response.status).toBe(503);expect(response.headers.get('Cache-Control')).toBe('no-store')
 const operator=await app.request('/api/operator/catalog/intelligence/discovery/content')
 expect(operator.status).toBe(503)
})
it('validates bounded catalog selectors before reading D1',async()=>{
 const env={CATALOG_PUBLIC_ENABLED:'true',CATALOG_DB:{} as D1Database}
 for(const query of ['ids=arbitrary','ids='+Array(61).fill('version-'+'a'.repeat(64)).join(','),'cursor='+'a'.repeat(81)]){
  expect((await app.request('/api/catalog/published?'+query,{},env)).status).toBe(400)
 }
})
