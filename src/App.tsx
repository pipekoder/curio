import { useEffect, useMemo, useState } from 'react'

import { magazineIssue, type MagazineIssue } from '../shared/magazine'
import Magazine from './Magazine'
import AdvertisingLibrary from './AdvertisingLibrary'

const lifestyleOptions = [
  'Japanese Wabi-Sabi', 'Gaudí / Catalan Modernism', 'Scandinavian',
  'French Style', 'British Vintage & Eclectic', 'Quiet Luxury',
  'Urban Creative', 'Nature & Outdoor',
]

const initialAllocations = { home: 40, fashion: 30, travel: 30 }
type Allocation = typeof initialAllocations

export default function App() {
  const [lifestyles, setLifestyles] = useState<string[]>(['Japanese Wabi-Sabi', 'Scandinavian'])
  const [interests, setInterests] = useState('')
  const [allocations, setAllocations] = useState<Allocation>(initialAllocations)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [consent, setConsent] = useState(false)
  const [available, setAvailable] = useState(false)
  const [issue, setIssue] = useState<MagazineIssue | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/magazine/config', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Configuration unavailable')
      const config = await response.json() as { enabled?: boolean; catalogSize?: number }
      setAvailable(config.enabled === true && Number(config.catalogSize) > 0)
      setStatus(config.catalogSize === 0 ? 'The fictional catalog is empty. Generation is unavailable.' : config.enabled === true ? '' : 'Magazine generation is disabled. No preferences will be sent to Meta.')
    }).catch(() => { if (!controller.signal.aborted) setStatus('The API is unavailable. Please try again later.') })
    return () => controller.abort()
  }, [])
  const total = useMemo(() => Object.values(allocations).reduce((sum, n) => sum + n, 0), [allocations])

  const toggle = (value: string) => setLifestyles(current => current.includes(value)
    ? current.filter(item => item !== value) : [...current, value])

  async function generate() {
    if (!available || !consent || loading) return
    setIssue(null)
    setLoading(true)
    setStatus('')
    try {
      const response = await fetch('/api/magazine', {
        signal: AbortSignal.timeout(20000),
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests, lifestyles, allocations, consent }),
      })
      const data = await response.json()
      if (!response.ok) {
        const failure = data as { message?: unknown; error?: unknown } | null
        const message = failure?.message ?? failure?.error
        setStatus(typeof message === 'string' ? message : 'Generation failed. Please try again later.')
        return
      }
      const parsed = magazineIssue.safeParse(data)
      if (!parsed.success) { setStatus('The edition could not be validated. Please try again later.'); return }
      setIssue(parsed.data)
      setStatus('Your private edition is ready.')
    } catch (error) {
      setStatus(error instanceof Error && error.name === 'TimeoutError' ? 'The request timed out. Please wait before trying again.' : 'The API is unavailable. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page">
      <header className="nav"><strong className="brand">curio<span>.</span></strong><span>THE MAGAZINE THAT STARTS WITH YOU</span></header>
      <section className="hero">
        <p className="eyebrow">A NEW WAY TO EXPERIENCE ADVERTISING</p>
        <h1>Follow your <em>curiosity.</em></h1>
        <p className="intro">Not another feed. An advertising magazine edited around your world—where every image is an invitation to discover more.</p>
      </section>
      <AdvertisingLibrary />
      <section className="config" aria-labelledby="edition-heading">
        <div className="section-label"><span>01 / YOUR EDITION</span><span>PERSONALIZE</span></div>
        <h2 id="edition-heading">What inspires you?</h2>
        <p>Choose the aesthetics you love. Mix several to make something unexpected.</p>
        <div className="chips">{lifestyleOptions.map(style => <button key={style} type="button" aria-pressed={lifestyles.includes(style)} className={lifestyles.includes(style) ? 'chip active' : 'chip'} onClick={() => toggle(style)}>{style}</button>)}</div>
        <label htmlFor="interests" className="input-label">Tell Curio what you're curious about</label>
        <textarea id="interests" value={interests} onChange={e => setInterests(e.target.value)} maxLength={1000} rows={3} placeholder="I'm looking for quiet spaces, sculptural lighting, independent designers and hidden places in Japan…" />
        <div className="section-label space"><span>02 / YOUR MIX</span><span>{total}% OF 100%</span></div>
        <h2>Make it yours.</h2>
        <p>Decide how much space each category gets in your magazine.</p>
        {(Object.keys(allocations) as (keyof Allocation)[]).map(key => <div className="slider" key={key}><label htmlFor={key}>{({ home: 'Home & Interior', fashion: 'Fashion & Styling', travel: 'Travel & Places' } as const)[key]} <strong>{allocations[key]}%</strong></label><input type="range" id={key} min="0" max="100" step="5" value={allocations[key]} onChange={e => setAllocations(current => ({ ...current, [key]: Number(e.target.value) }))} /></div>)}
        <p className="transparency">Every image keeps its source and rights classification. The fallback illustrations are fictional. Commentary is AI interpretation, not verified fact; no shopping links are generated.</p>
        <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I agree to send these preferences to Meta Muse Spark 1.3 Standard for this edition. Do not enter personal or sensitive information.</label>
        <div className="actions"><button type="button" className="generate" disabled={!available || !consent || total !== 100 || !lifestyles.length || loading} onClick={generate}>{loading ? 'Creating your edition…' : 'Generate my magazine →'}</button><span className={total === 100 ? 'valid' : 'invalid'}>{total === 100 ? 'Your mix is ready' : 'Adjust categories to total 100%'}</span></div>
        {status && <p className="notice" role="status">{status}</p>}
      </section>
      {issue && <Magazine key={issue.id} issue={issue} />}
      <footer>CURIO / FROM ADVERTISING TO DISCOVERY <span>HACKATHON PROTOTYPE</span></footer>
    </main>
  )
}
