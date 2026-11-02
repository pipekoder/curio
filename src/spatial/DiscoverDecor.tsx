import './discover-decor.css'

// Static decorative composition for the Discover landing only: orbital
// lines, glass planes, floor rings, corner ticks and caption markers.
// Purely presentational: never interactive, hidden from assistive tech,
// unmounted with the dock. No animation, no state, no telemetry.
export default function DiscoverDecor({variant}:{variant?:'discover'|'exhibit'}){
  const exhibit=variant==='exhibit'
  return <div className={`discover-decor${exhibit?' exhibit-decor':''}`} aria-hidden="true">
    <svg className="decor-orbits" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" focusable="false">
      <ellipse cx="720" cy="450" rx="640" ry="330" transform="rotate(-7 720 450)"/>
      <ellipse cx="720" cy="470" rx="500" ry="390" transform="rotate(10 720 470)"/>
      <circle cx="240" cy="330" r="3"/>
      <circle cx="1205" cy="470" r="3"/>
      <circle cx="880" cy="150" r="2.5"/>
      <circle cx="430" cy="760" r="2.5"/>
    </svg>
    {!exhibit&&<>
      <div className="decor-plane plane-l1"/>
      <div className="decor-plane plane-l2"/>
      <div className="decor-plane plane-r1"/>
      <div className="decor-plane plane-r2"/>
    </>}
    <svg className="decor-floor" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs>
        <radialGradient id="discover-floor-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#cfe0ff" stopOpacity=".55"/>
          <stop offset="60%" stopColor="#cfe0ff" stopOpacity=".18"/>
          <stop offset="100%" stopColor="#cfe0ff" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="720" cy="760" rx="380" ry="90" fill="url(#discover-floor-glow)" stroke="none"/>
      <ellipse cx="720" cy="755" rx="330" ry="62"/>
      <ellipse cx="720" cy="752" rx="230" ry="42"/>
      <ellipse cx="720" cy="750" rx="140" ry="26"/>
    </svg>
    <span className="decor-corner tl"/>
    <span className="decor-corner tr"/>
    <span className="decor-corner bl"/>
    <span className="decor-corner br"/>
    {exhibit?<>
      <span className="decor-tag tag-orbit">Exhibit 01</span>
      <span className="decor-tag tag-culture">Culture</span>
      <span className="decor-scroll"><span className="decor-scroll-dot"/></span>
    </>:<>
      <span className="decor-tag tag-orbit">Orbit 01</span>
      <span className="decor-tag tag-culture">Culture</span>
      <span className="decor-tag tag-objects">Objects</span>
      <span className="decor-tag tag-ideas">Ideas</span>
    </>}
    <span className="decor-reticle"/>
  </div>
}
