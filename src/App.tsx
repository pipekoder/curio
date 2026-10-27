import { useMemo, useState } from 'react'

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
  const total = useMemo(() => Object.values(allocations).reduce((sum, n) => sum + n, 0), [allocations])

  const toggle = (value: string) => setLifestyles(current => current.includes(value)
    ? current.filter(item => item !== value) : [...current, value])

  async function generate() {
    setLoading(true)
    setStatus('')
    try {
      const response = await fetch('/api/magazine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests, lifestyles, allocations }),
      })
      const data = await response.json() as { message?: string; error?: string }
      setStatus(data.message ?? data.error ?? 'Unexpected response.')
      if (!response.ok) return
    } catch {
      setStatus('The API is unavailable. Start the Cloudflare Worker to test generation.')
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
        <div className="actions"><button type="button" className="generate" disabled={total !== 100 || !lifestyles.length || loading} onClick={generate}>{loading ? 'Creating your edition…' : 'Generate my magazine →'}</button><span className={total === 100 ? 'valid' : 'invalid'}>{total === 100 ? 'Your mix is ready' : 'Adjust categories to total 100%'}</span></div>
        {status && <p className="notice" role="status">{status}</p>}
      </section>
      <footer>CURIO / FROM ADVERTISING TO DISCOVERY <span>HACKATHON PROTOTYPE</span></footer>
    </main>
  )
}
