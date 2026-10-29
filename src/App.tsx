import EditorialExperience from "./EditorialExperience";
export default function App() {
  const referencePrototype = new URLSearchParams(window.location.search).get("prototype") === "reference";
  return (
    <main className={`page primary-reader${referencePrototype ? " reference-prototype" : ""}`}>
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
      <EditorialExperience referencePrototype={referencePrototype} />
      <footer>
        <strong>curio.</strong>
        <span>
          A slower way to discover. Your collection stays in this browser.
        </span>
      </footer>
    </main>
  );
}
