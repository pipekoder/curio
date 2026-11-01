import {expect,it} from 'vitest'
import {catalogItem} from '../shared/catalog'
import {editorialPlan,validatePlan} from '../shared/editorial'
import {editorialSources} from '../shared/editorial-sources'
import {authoredRequest,authoredResponse} from './fixtures/silver-field-api'

it('keeps the non-billable Silver Field response fixture on the existing editorial contract',()=>{
 expect(authoredRequest.consent).toBe(false)
 expect(authoredResponse).toMatchObject({source:'deterministic',retrieval:'fictional',cached:false,fallbackReason:'disabled',inference:{attempted:false,reservedUnits:0,usage:null}})
 const items=catalogItem.array().parse(authoredResponse.items)
 const plan=editorialPlan.parse(authoredResponse.plan)
 expect(validatePlan(plan,items)).toEqual(plan)
 expect(editorialSources.parse(authoredResponse.editorialSources)).toEqual([])
 for(const feature of plan.features)expect(items.some(item=>item.id===feature.catalogId&&item.image.id===feature.assetId)).toBe(true)
})
