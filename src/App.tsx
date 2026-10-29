/// <reference types="vite/client" />
import EditorialExperience from "./EditorialExperience";
export default function App() {
  // Keep the pre-release reader reachable only for local regression fixtures.
  // Public hosts always receive the approved five-stage experience.
  const localLegacyFixture = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && new URLSearchParams(window.location.search).get("legacy") === "1";
  return (
    <main className={`page primary-reader${localLegacyFixture ? "" : " reference-prototype"}`}>
      <a className="skip-link" href="#discovery-prompt">
        Skip to magazine prompt
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
