import {expect,it} from 'vitest'
import {loadEditorialFont,normalizeTemplate,templateOf} from '../src/spatial/editorial-book'
import {stageArticleEdition} from '../src/spatial/staging'
import {articleEditionFixture} from './article-fixtures'

it('assigns templates deterministically from the stable article ID',()=>{
  expect(templateOf('story-1')).toBe(templateOf('story-1'))
  expect(['spread','gallery','fullbleed']).toContain(templateOf('story-1'))
  expect(templateOf('')).toBe('spread')
  expect(templateOf(null as unknown as string)).toBe('spread')
})

it('distributes varied IDs across all three templates without rotation',()=>{
  const seen=new Set(Array.from({length:300},(_,n)=>templateOf(`article-demo-${n}-stable`)))
  expect([...seen].sort()).toEqual(['fullbleed','gallery','spread'])
})

it('falls back to Editorial Spread for anything unexpected',()=>{
  expect(normalizeTemplate('spread')).toBe('spread')
  expect(normalizeTemplate('gallery')).toBe('gallery')
  expect(normalizeTemplate('fullbleed')).toBe('fullbleed')
  for(const value of [undefined,null,'','cover',0,{}])expect(normalizeTemplate(value)).toBe('spread')
})

it('requests the display font once with swap',()=>{
  loadEditorialFont()
  loadEditorialFont()
  const links=[...document.querySelectorAll('link[data-editorial-display]')]
  expect(links).toHaveLength(1)
  expect(links[0].getAttribute('href')).toBe('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap')
})

it('passes catalog image dimensions through for layout-stable rendering',()=>{
  const {articleEdition,items}=articleEditionFixture()
  const {exhibits}=stageArticleEdition({articleEdition,items})
  expect(exhibits.length).toBeGreaterThan(0)
  for(const exhibit of exhibits)for(const image of exhibit.article!.storyImages){
    expect(image.width).toEqual(expect.any(Number))
    expect(image.width).toBeGreaterThan(0)
    expect(image.height).toBeGreaterThan(0)
  }
})
