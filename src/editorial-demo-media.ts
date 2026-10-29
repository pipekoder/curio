import allocation from '../docs/DISCOVER_ASSET_ALLOCATION.json'
import {catalogItem, type CatalogItem} from '../shared/catalog'
import {chairDemo,chairDemoDetails} from './chair-demo'

type Category = CatalogItem['category']
type Tag = CatalogItem['lifestyleTags'][number]
type Product = {id:string;brandId:string;brandName:string;name:string;priceUsd:number;assumptions:readonly string[];hotspot:{x:number;y:number;label:string}}
type StorySeed = {id:string;category:Category;tags:readonly Tag[];title:string;description:string;related:readonly string[];product?:Product}
const brand={id:'curio-fictional-studio',name:'Curio Fictional Studio (fictional)'} as const
const item=(id:number,category:Category,tags:readonly Tag[],title:string,description:string,related:number[],product?:Omit<Product,'brandId'|'brandName'>):StorySeed=>({
 id:`curio-owner-${String(id).padStart(2,'0')}`,category,tags,title,description,
 related:related.map(n=>`curio-owner-${String(n).padStart(2,'0')}`),
 ...(product?{product:{...product,brandId:brand.id,brandName:brand.name}}:{})
})

// Editorial copy describes visible subjects only. Product identities, prices and
// materials are fictional demo assumptions, never extracted publisher facts.
const seeds:readonly StorySeed[]=[
 item(1,'home',['Quiet Luxury'],'A Seat in Soft Light','A rounded chair sits in a pale interior; its maker and upholstery are unverified.',[8,16]),
 item(2,'home',['Japanese Wabi-Sabi'],'The Ceramic Pause','A vessel gives a quiet still life a focal point; material and maker are unverified.',[13,21]),
 item(3,'home',['Scandinavian'],'An Arch for Living','An arched interior frames a conversation about light and space.',[7,19]),
 item(4,'home',['Nature & Outdoor'],'A Study of Stone','A close view of pale, stone-like texture invites attention to surface and light.',[12,21]),
 item(5,'fashion',['Quiet Luxury'],'The Person in the Frame','A portrait connects clothing, posture and the surrounding space without claiming an identity.',[18,24]),
 item(6,'home',['Japanese Wabi-Sabi'],'A Small Ritual','A coffee setting becomes an invitation to notice pause and repetition.',[23,15]),
 item(7,'home',['Scandinavian'],'A Room of Curves','Soft furniture and architecture create a layered interior composition.',[3,20]),
 item(8,'home',['Quiet Luxury'],'The Ochre Chair','A low, rounded ochre chair stands against a pale room; maker and construction are unknown.',[16,12],{id:'demo-ochre-chair-v1',name:'Ochre Arc Chair',priceUsd:1740,assumptions:['Rounded upholstered silhouette (visible)','Ochre color (visible)','Exact fabric and dimensions unverified'],hotspot:{x:.5,y:.63,label:'Curved chair seat'}}),
 item(9,'travel',['Nature & Outdoor'],'At the Edge of the Coast','Coastal architecture gives the landscape a human scale; the place is not identified.',[14,26]),
 item(10,'travel',['Nature & Outdoor'],'Winter Horizon','A cool coastal view opens a visual thread about distance and shelter.',[9,14]),
 item(11,'home',['Japanese Wabi-Sabi'],'Stone and Shadow','A still life of natural-looking forms explores balance and empty space.',[4,21]),
 item(12,'home',['Quiet Luxury'],'Surface, Up Close','A pale textured surface fills the frame. Its fiber or material is not verified.',[16,17]),
 item(13,'home',['Japanese Wabi-Sabi'],'A Vessel in the Room','A vessel punctuates an interior scene; its maker and material are unknown.',[2,15]),
 item(14,'travel',['Nature & Outdoor'],'Light on the Coast','An architectural coastal scene connects built form and open horizon without identifying a place.',[9,26]),
 item(15,'home',['Japanese Wabi-Sabi'],'Objects on a Table','A tabletop arrangement invites a closer look at scale, spacing and ritual.',[6,23]),
 item(16,'home',['Quiet Luxury'],'The Architecture of a Seat','A low curved chair sits beneath an arch. Its visible form, not its maker or materials, anchors the story.',[8,12,17],{id:chairDemo.id,name:chairDemo.name,priceUsd:chairDemoDetails.price.amount,assumptions:chairDemoDetails.assumptions,hotspot:{...chairDemoDetails.hotspot,label:'Rounded seat and back'}}),
 item(17,'home',['Nature & Outdoor'],'Soft Edges, Open View','Soft furnishing, a vessel and an open arch connect tactile-looking surfaces with distant light.',[12,16,22]),
 item(18,'fashion',['Quiet Luxury'],'A Silhouette at the Window','A light-colored loose garment appears in profile; its design, fabric and wearer are not identified.',[5,24],{id:'demo-window-overshirt-v1',name:'Window Overshirt',priceUsd:480,assumptions:['Loose silhouette (visible)','Light neutral color (visible)','Fabric and construction unverified'],hotspot:{x:.53,y:.62,label:'Loose garment silhouette'}}),
 item(19,'home',['Scandinavian'],'Within the Arch','An arch shapes a view into an interior, drawing attention to depth and passage.',[3,20]),
 item(20,'home',['Quiet Luxury'],'A Room for Pausing','A furnished room sets up a visual conversation about distance between objects.',[7,22]),
 item(21,'home',['Japanese Wabi-Sabi'],'The Object Still Life','Small objects and textures create a quiet study in proportion.',[11,15]),
 item(22,'travel',['Nature & Outdoor'],'The Coastal Room','A room opens toward a coastal-looking view; no location or property is identified.',[17,26]),
 item(23,'home',['Japanese Wabi-Sabi'],'Tabletop Notes','A tabletop scene suggests a private ritual without identifying products or makers.',[6,15]),
 item(24,'home',['Quiet Luxury'],'A Chair Remembered','A chair portrait centers curved form and space; product identity is unverified.',[8,16]),
 item(25,'home',['Scandinavian'],'Around the Table','A dining interior becomes a study in arrangement and gathering.',[7,20]),
 item(26,'travel',['Nature & Outdoor'],'Collecting the Horizon','A coastal architecture study suggests a journey without claiming a real destination.',[9,14]),
]

export const demoMedia = seeds.map(seed=>{
 const file=allocation.find(a=>a.id===seed.id)
 if(!file)throw Error(`Missing approved demo asset: ${seed.id}`)
 const stageDirectory={'Discover':'discover','Generate':'generate','Read & Explore':'read','Curiosity Journey':'journey','Collect':'collect'}[file.stage]
 if(!stageDirectory)throw Error(`Unknown approved stage: ${seed.id}`)
 return {...seed,stage:file.stage,assetId:`${seed.id}-v1`,storyId:`story-${seed.id}-v1`,path:`/editorial/${stageDirectory}/${file.filename}`,fingerprint:file.sha256,width:file.width,height:file.height,role:file.role}
})

export const readerDemoCatalog:readonly CatalogItem[]=demoMedia.filter(m=>m.stage==='Read & Explore').map(m=>m.id===chairDemo.image.id.replace('-v1','')?chairDemo:catalogItem.parse({
 id:`demo-${m.id}-v1`,category:m.category,name:m.product?.name??m.title,description:m.description,lifestyleTags:m.tags,
 sourceType:m.product?'synthetic_concept':'editorial_support',
 advertiser:m.product?{name:m.product.brandName,verification:'unverified',evidence:null}:null,
 campaign:{title:'Curio fictional editorial study',reference:'docs/PR30_DEMO_CATALOG.md'},
 image:{id:m.assetId,path:m.path,externalUrl:null,fallbackPath:null,alt:m.description,width:m.width,height:m.height,role:'supplied_image'},
 provenance:{origin:'owner_supplied',sourceUrl:null,originalSourcePage:null,evidence:'docs/PR30_DEMO_CATALOG.md',attribution:'Owner-supplied Curio editorial image · fictional context',modifications:[{date:'2026-10-29',description:'Recorded visual-only demo metadata; image bytes unchanged.'}]},
 licensing:{status:'cleared',rightsHolder:'Owner-supplied Curio editorial asset',evidence:'docs/PR30_DEMO_CATALOG.md'},
 permissions:{display:{status:'approved',evidence:'docs/PR30_DEMO_CATALOG.md'},aiAnalysis:{status:'pending',evidence:null},edits:{status:'pending',evidence:null}},
 verifiedBrandLink:null,
 discoverableObjects:m.product?[{id:`detail-${m.id}`,label:m.product.hotspot.label,description:`Visible ${m.product.hotspot.label.toLowerCase()}; maker and material are unverified.`,grounding:'catalog_metadata',productIdentity:`${m.product.name} — fictional demo concept`}]:[]
}))

export const demoMediaFor=(assetId:string)=>demoMedia.find(m=>m.assetId===assetId)
