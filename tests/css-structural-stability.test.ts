import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join,dirname} from 'node:path'

const root=join(dirname(fileURLToPath(import.meta.url)),'..')
const discover=readFileSync(join(root,'src/discover-preview.css'),'utf8')
const stages=readFileSync(join(root,'src/visual-stages.css'),'utf8')

describe('phase 1 structural stability',()=>{
 it('gives the Reader detail panel an explicit overlay position in the shared sidebar area',()=>{
  const rule=stages.match(/\.chair-demo-detail\{[^}]*z-index:4[^}]*\}/)
  expect(rule).not.toBeNull()
  expect(rule![0]).toContain('grid-area:sidebar')
  expect(rule![0]).toContain('position:relative')
 })
 it('keeps chapter entrance fill from retaining a transform that competes with hover',()=>{
  expect(stages).toContain('reader-image-enter .55s ease-out backwards')
  expect(stages).not.toContain('reader-image-enter .55s ease-out both')
  expect(stages).toContain('.reader-chapter-image:hover img{transform:scale(1.025)}')
 })
 it('anchors Discover actions and prompt below the sentence with fixed fallbacks intact',()=>{
  expect(discover).toContain('anchor-name:--lib-sentence')
  expect(discover).toContain('anchor-name:--lib-actions')
  expect(discover).toContain('anchor(--lib-sentence bottom)')
  expect(discover).toContain('anchor(--lib-actions top)')
  expect(discover).toContain('@supports (top:anchor(bottom))')
  expect(discover).toContain('.prompt-library-actions{position:absolute;top:calc(323 * var(--u))')
  expect(discover).toContain('.reference-discover .reference-prompt{top:calc(362 * var(--u))}')
  const slot=discover.match(/\.prompt-library-slot\{[^}]*\}/)
  expect(slot).not.toBeNull()
  expect(slot![0]).not.toContain('white-space:nowrap')
 })
 it('lets the Generate cover grow with content instead of clipping at a fixed height',()=>{
  const rule=stages.match(/\.visual-gen-cover\{[^}]*z-index:5[^}]*\}/)
  expect(rule).not.toBeNull()
  expect(rule![0]).toContain('min-height:calc(319 * var(--u))')
  expect(rule![0]).toContain('max-height:calc(360 * var(--u))')
  expect(rule![0]).not.toMatch(/[{;]height:calc\(319/)
  expect(stages).toContain('.visual-gen-plane,.visual-gen-cover{position:absolute;overflow:hidden;')
 })
 it('contains no demonstrably unused or overridden rules from the phase 1 removal set',()=>{
  for(const css of [discover,stages]){
   expect(css).not.toContain('.reference-suggestions')
   expect(css).not.toContain('.visual-reader-image')
   expect(css).not.toContain('.visual-reader-details')
   expect(css).not.toContain('.journey-links-mobile')
   expect(css).not.toContain('.discover-result')
   expect(css).not.toContain('.reference-reader-controls')
  }
  expect(stages.match(/@keyframes curio-assemble/g)).toHaveLength(1)
 })
 it('preserves reduced-motion, dialog close, and hotspot affordances',()=>{
  expect(discover).toContain('prefers-reduced-motion')
  expect(stages).toContain('prefers-reduced-motion')
  expect(stages).toContain('.reference-prototype .discovery-dialog>.dialog-close{position:fixed')
  expect(stages).toContain('.chair-demo-hotspot{position:absolute')
 })
})
