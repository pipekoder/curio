import {demoMediaFor} from '../editorial-demo-media'
import manifest from './nodes.manifest.json'
import type {EditorialEdition} from '../../shared/editorial'

export type StagedHotspot={id:string;label:string;x:number;y:number;productName:string;brandName:string;priceUsd:number;assumptions:readonly string[]}
export type StagedExhibit={
  assetId:string;title:string;narrative:string;image:string;
  attribution:string;rights:string;hotspots:StagedHotspot[];thread?:string
}

const thumbnails=new Map((manifest as {assetId:string;thumbnail:string}[]).map(entry=>[entry.assetId,entry.thumbnail]))

// Maps a validated edition to stageable exhibits. A feature stages only when
// it joins a pooled catalog item AND approved local artwork exists; anything
// else is counted as skipped, never invented. Showcase cap: 6.
export function stageEdition(edition:EditorialEdition,max=6):{exhibits:StagedExhibit[];skipped:number}{
  const exhibits:StagedExhibit[]=[]
  let skipped=0
  for(const feature of edition.plan.features){
    if(exhibits.length>=max)break
    const item=edition.items.find(candidate=>candidate.id===feature.catalogId&&candidate.image.id===feature.assetId)
    const image=thumbnails.get(feature.assetId)
    if(!item||!image){skipped++;continue}
    const media=demoMediaFor(feature.assetId)
    exhibits.push({
      assetId:feature.assetId,title:feature.headline,narrative:feature.narrative,image,
      attribution:item.provenance.attribution,
      rights:`${item.licensing.rightsHolder} · ${media?.path.split('/').pop()??item.image.id}`,
      hotspots:media?.product?[{
        id:media.product.id,label:media.product.hotspot.label,x:media.product.hotspot.x,y:media.product.hotspot.y,
        productName:media.product.name,brandName:media.product.brandName,priceUsd:media.product.priceUsd,assumptions:media.product.assumptions,
      }]:[],
      thread:edition.plan.connections?.find(connection=>connection.fromAssetId===feature.assetId)?.thread,
    })
  }
  return {exhibits,skipped}
}
