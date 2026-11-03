// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest'
import app from '../worker/index'
import {editorialArticlePool} from '../worker/editorial-article-pool'
vi.mock('../worker/editorial-article-pool',()=>({editorialArticlePool:vi.fn()}))
const origin='https://curio.example'
const token='operator-test-token-at-least-32-bytes'
const path=`${origin}/api/operator/catalog/intelligence/articles/readiness?prompt=${encodeURIComponent('Explore Scandinavian interiors')}`
const env={CATALOG_OPERATOR_ENABLED:'true',CATALOG_OPERATOR_TOKEN:token,CATALOG_DB:{},PUBLIC_APP_ORIGIN:origin,EDITORIAL_ARTICLE_PREPARATION_ENABLED:'false'} as never
const headers={Origin:origin,'CF-Connecting-IP':'192.0.2.1'}
afterEach(()=>vi.mocked(editorialArticlePool).mockReset())
it('exposes bounded exclusion counts only through existing operator authentication',async()=>{
 vi.mocked(editorialArticlePool).mockResolvedValue({items:[],sources:[],visualContexts:[],eligibleCount:1,preparation:{pendingVersionIds:['version-'+'a'.repeat(64)],processing:2,failed:1,rankedCount:30,evaluatedCount:24,exclusions:{relevance_or_window:0,publication:3,permissions:2,metadata:4,sources:1,image_integrity:2,observations:14,analysis_processing:2,analysis_failed:1,invalid_observations:0,duplicate_image:0}}})
 expect((await app.request(path,{headers:{...headers,Authorization:'Bearer wrong'}},env)).status).toBe(403)
 const result=await app.request(path,{headers:{...headers,Authorization:`Bearer ${token}`}},env)
 expect(result.status).toBe(200)
 const text=await result.text()
 expect(text).not.toContain('version-')
 expect(JSON.parse(text)).toMatchObject({eligibleImages:1,requiredImages:6,ready:false,pendingAnalysis:1,processingAnalysis:2,failedAnalysis:1,preparationEnabled:false,exclusions:{relevance_or_window:0,publication:3,permissions:2,metadata:4,sources:1,image_integrity:2,observations:14}})
 expect(editorialArticlePool).toHaveBeenCalledOnce()
})
it('rejects malformed prompts without querying private catalog data',async()=>{
 const result=await app.request(`${origin}/api/operator/catalog/intelligence/articles/readiness?prompt=`,{headers:{...headers,Authorization:`Bearer ${token}`}},env)
 expect(result.status).toBe(400)
 expect(editorialArticlePool).not.toHaveBeenCalled()
})
