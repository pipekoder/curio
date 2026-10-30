/// <reference types="vite/client" />
import EditorialExperience from "./EditorialExperience";
import {useEffect,useState} from 'react';
import {isExplorePath} from './explore-route';
import MediaStudio from './MediaStudio';
export default function App() {
  return window.location.pathname==='/internal/media'?<MediaStudio/>:<PublicApp/>;
}
function PublicApp() {
  // Keep the pre-release reader reachable only for local regression fixtures.
  // Public hosts always receive the approved five-stage experience.
  const localLegacyFixture = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && new URLSearchParams(window.location.search).get("legacy") === "1";
  const [explore,setExplore]=useState(()=>isExplorePath(window.location.pathname));
  useEffect(()=>{const sync=()=>setExplore(isExplorePath(window.location.pathname));window.addEventListener('popstate',sync);window.addEventListener('curio:route',sync);return()=>{window.removeEventListener('popstate',sync);window.removeEventListener('curio:route',sync)}},[]);
  return (
    <main className={`page primary-reader${localLegacyFixture ? "" : " reference-prototype"}`}>
      <a className="skip-link" href={explore?'#reader-heading':'#discovery-prompt'}>
        {explore?'Skip to reader':'Skip to magazine prompt'}
      </a>
      <header className="nav">
        <a className="brand" href="/" aria-label="Curio home">
          curio<span>.</span>
        </a>
        <span>A JOURNAL FOR THE CURIOUS</span>
        <a href="#discovery-prompt">Create an edition →</a>
      </header>
      <EditorialExperience discoverReview={!localLegacyFixture} />
      <footer>
        <strong>curio.</strong>
        <span>
          A slower way to discover. Your collection stays in this browser.
        </span>
      </footer>
    </main>
  );
}
