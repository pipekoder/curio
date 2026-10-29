/// <reference types="vite/client" />
import EditorialExperience from "./EditorialExperience";
export default function App() {
  const discoverReview = import.meta.env.VITE_DISCOVER_REVIEW === "true" || new URLSearchParams(window.location.search).get("prototype") === "discover";
  return (
    <main className={`page primary-reader${discoverReview ? " reference-prototype" : ""}`}>
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
      <EditorialExperience discoverReview={discoverReview} />
      <footer>
        <strong>curio.</strong>
        <span>
          A slower way to discover. Your collection stays in this browser.
        </span>
      </footer>
    </main>
  );
}
