import {demoMediaFor} from '../editorial-demo-media'
import type {EditorialEdition} from '../../shared/editorial'
import type {CatalogItem} from '../../shared/catalog'

export type StagedHotspot={id:string;label:string;x:number;y:number;productName:string;brandName:string;priceUsd:number;assumptions:readonly string[]}
export type StagedExhibit={
  assetId:string;title:string;narrative:string;image:string;
  attribution:string;rights:string;hotspots:StagedHotspot[];thread?:string
  catalogId:string;featureIndex:number
}

// Maps a validated edition to stageable exhibits. A feature stages only when
// it joins a returned catalog item on both IDs AND approved artwork exists;
// anything else is counted as skipped, never invented. Showcase cap: 6.
// Artwork prefers the local path, then the approved external URL, then the
// local fallback. Demo hotspots enhance local-pool items only; D1 items
// carry no hotspot claims the client could ground.
function resolveImage(item:CatalogItem):string|null{
  return item.image.path??item.image.externalUrl??item.image.fallbackPath??null
}

export function stageEdition(edition:EditorialEdition,max=6):{exhibits:StagedExhibit[];skipped:number}{
  const exhibits:StagedExhibit[]=[]
  let skipped=0
  for(const [position,feature] of edition.plan.features.entries()){
    if(exhibits.length>=max)break
    // Editions filtered to stageable features carry each feature's true plan
    // position for citation matching; direct plans use list position.
    const planIndex=(feature as {planIndex?:unknown}).planIndex
    const featureIndex=typeof planIndex==='number'?planIndex:position
    const item=edition.items.find(candidate=>candidate.id===feature.catalogId&&candidate.image.id===feature.assetId)
    const image=item?resolveImage(item):null
    if(!item||!image){skipped++;continue}
    const media=demoMediaFor(feature.assetId)
    exhibits.push({
      assetId:feature.assetId,catalogId:feature.catalogId,featureIndex,
      title:feature.headline,narrative:feature.narrative,image,
      attribution:item.provenance.attribution,
      rights:`${item.licensing.rightsHolder??'Rights holder unlisted'} · ${item.image.id}`,
      hotspots:media?.product?[{
        id:media.product.id,label:media.product.hotspot.label,x:media.product.hotspot.x,y:media.product.hotspot.y,
        productName:media.product.name,brandName:media.product.brandName,priceUsd:media.product.priceUsd,assumptions:media.product.assumptions,
      }]:[],
      thread:edition.plan.connections?.find(connection=>connection.fromAssetId===feature.assetId)?.thread,
    })
  }
  const unique=[...new Map(exhibits.map(exhibit=>[exhibit.assetId,exhibit])).values()].slice(0,6)
  return {exhibits:unique,skipped}
}
