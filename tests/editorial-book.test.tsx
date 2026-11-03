import {afterEach,expect,it} from 'vitest'
import type {ComponentProps} from 'react'
import {cleanup,render} from '@testing-library/react'
import ArticleCard from '../src/spatial/ArticleCard'
import {templateOf,type BookTemplate} from '../src/spatial/editorial-book'
import type {StagedArticleImage,StagedExhibit} from '../src/spatial/staging'

afterEach(()=>cleanup())

const images=(count:number):StagedArticleImage[]=>Array.from({length:count},(_,at)=>({
  catalogId:`catalog-${at}`,assetId:`asset-${at}`,image:`/art-${at}.jpg`,alt:`Artwork ${at}`,
  brandName:`Brand ${at}`,attribution:`Gallery ${at}`,rights:`Rights ${at}`,width:1200,height:900,
}))
const exhibit=(over:Partial<StagedExhibit>={},paragraphs=5,photos=3):StagedExhibit=>({
  assetId:'asset-0',catalogId:'catalog-0',featureIndex:0,title:'The Quiet Craft',
  narrative:Array.from({length:paragraphs},(_,n)=>`Paragraph ${n+1} of the story.`).join('\n\n'),
  image:'/art-0.jpg',attribution:'Gallery 0',rights:'Rights 0',hotspots:[],
  article:{id:'story-quiet-craft',deck:'A short introduction.',storyImages:images(photos)},
  ...over,
})
const props=(over:Partial<ComponentProps<typeof ArticleCard>>={})=>({
  exhibit:exhibit(),plan:null,index:0,total:1,expanded:true,onToggle:()=>{},
  scrollTop:{current:0},spotlightId:null,onConsumeSpotlight:()=>{},...over,
})

for(const variant of ['spread','gallery','fullbleed'] as BookTemplate[]){
  it(`renders the whole story in the ${variant} template`,()=>{
    const {container}=render(<ArticleCard {...props({template:variant})}/>)
    const root=container.querySelector('article')!
    expect(root.className).toContain(`is-${variant}`)
    expect(root.querySelector('h2')?.textContent).toBe('The Quiet Craft')
    expect(root.querySelector('.eb-deck')?.textContent).toBe('A short introduction.')
    expect([...root.querySelectorAll('.eb-flow > p')].map(p=>p.textContent)).toEqual([
      'Paragraph 1 of the story.','Paragraph 2 of the story.','Paragraph 3 of the story.',
      'Paragraph 4 of the story.','Paragraph 5 of the story.',
    ])
    // Hero plus every approved photo, each with brand and attribution.
    expect(root.querySelectorAll('img')).toHaveLength(3)
    expect([...root.querySelectorAll('figure')].map(figure=>figure.textContent)).toHaveLength(3)
    for(const brand of ['Brand 0','Brand 1','Brand 2'])expect(root.textContent).toContain(brand)
    for(const attr of ['Gallery 1 · Rights 1','Gallery 2 · Rights 2'])expect(root.textContent).toContain(attr)
  })
}

it('interleaves photos with the narrative instead of stacking them first',()=>{
  const {container}=render(<ArticleCard {...props({template:'spread'})}/>)
  const flow=container.querySelector('.eb-flow')!
  const paras=[...flow.querySelectorAll(':scope > p')]
  const figures=[...flow.querySelectorAll(':scope > figure')]
  expect(paras).toHaveLength(5)
  expect(figures).toHaveLength(2)
  // Five paragraphs in three groups: photo after the 2nd, photo after the 4th.
  expect(paras[1].compareDocumentPosition(figures[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  expect(figures[0].compareDocumentPosition(paras[2])).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  expect(paras[3].compareDocumentPosition(figures[1])).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  expect(figures[1].compareDocumentPosition(paras[4])).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
})

it('groups supporting photos in the gallery template and keeps the rest in flow',()=>{
  const {container}=render(<ArticleCard {...props({exhibit:exhibit({},5,5),template:'gallery'})}/>)
  const group=container.querySelector('.eb-group')!
  expect(group.querySelectorAll(':scope > figure')).toHaveLength(2)
  expect(container.querySelectorAll('.eb-flow img')).toHaveLength(4)
  expect(container.querySelectorAll('img')).toHaveLength(5)
})

it('keeps every photo when paragraphs are fewer than photos',()=>{
  const {container}=render(<ArticleCard {...props({exhibit:exhibit({},1,4),template:'fullbleed'})}/>)
  expect(container.querySelectorAll('.eb-flow > p')).toHaveLength(1)
  expect(container.querySelectorAll('.eb-flow img')).toHaveLength(3)
  expect(container.querySelectorAll('img')).toHaveLength(4)
})

it('lazy-loads below-fold photos with stable dimensions',()=>{
  const {container}=render(<ArticleCard {...props({template:'spread'})}/>)
  const figures=[...container.querySelectorAll('.eb-figure img')]
  expect(figures).toHaveLength(2)
  for(const img of figures){
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('width')).toBe('1200')
    expect(img.getAttribute('height')).toBe('900')
  }
  expect(container.querySelector('.eb-herofigure img')?.getAttribute('loading')).toBeNull()
})

it('renders object discovery on every story image, hero and non-hero',()=>{
  const {container}=render(<ArticleCard {...props({template:'spread'})}/>)
  expect(container.querySelectorAll('.object-frame')).toHaveLength(3)
  expect(container.querySelector('.eb-herofigure .object-frame')).toBeTruthy()
  expect(container.querySelectorAll('.eb-flow .object-frame')).toHaveLength(2)
  expect(container.querySelectorAll('.eb-figure')).toHaveLength(2)
})

it('assigns a stable template from the article ID and falls back to spread',()=>{
  const assigned=templateOf('story-quiet-craft')
  const {container}=render(<ArticleCard {...props()}/>)
  expect(container.querySelector('article')!.className).toContain(`is-${assigned}`)
  const fallback=render(<ArticleCard {...props({template:'cover' as unknown as BookTemplate})}/>)
  expect(fallback.container.querySelector('article')!.className).toContain('is-spread')
})

it('leaves feature exhibits on the existing layout',()=>{
  const plain=exhibit({article:undefined})
  const {container}=render(<ArticleCard {...props({exhibit:plain})}/>)
  const root=container.querySelector('article')!
  expect(root.className).not.toContain('editorial-book')
  expect(root.querySelector('h2')?.textContent).toBe('The Quiet Craft')
  expect(root.textContent).toContain('Gallery 0 · Rights 0')
})
