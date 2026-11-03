// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest'
import {CatalogPublications} from '../worker/catalog-publications'
import {revisionEvidence} from '../worker/editorial-revision-evidence'
import type {ArticleEditionBody} from '../shared/editorial-articles'

afterEach(()=>vi.restoreAllMocks())
it('fails closed on revoked or missing published exact-version assets before media or inference',async()=>{
 const first=`version-${'a'.repeat(64)}`,second=`version-${'b'.repeat(64)}`
 const edition={version:'curio-editorial-article-v1',title:'A story',deck:'An article.',articles:[{id:`article-${first}`,heroAssetId:first,headline:'One room',deck:'An idea.',narrative:'A narrative.',images:[{catalogId:'catalog-a',assetId:first,brandName:'A',brandSourceId:`${first}:brand_name`,productSourceIds:[]},{catalogId:'catalog-b',assetId:second,brandName:'B',brandSourceId:`${second}:brand_name`,productSourceIds:[]}],sourceIds:[`${first}:brand_name`,`${second}:brand_name`]}]} as ArticleEditionBody
 vi.spyOn(CatalogPublications.prototype,'list').mockResolvedValue({items:[],nextCursor:null})
 const head=vi.fn()
 await expect(revisionEvidence({CATALOG_DB:{} as D1Database,MEDIA_BUCKET:{head} as unknown as R2Bucket,CATALOG_PUBLIC_ENABLED:'true'} as never,edition)).rejects.toThrow('Article evidence unavailable')
 expect(head).not.toHaveBeenCalled()
})
