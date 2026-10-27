import EditorialExperience from "./EditorialExperience";
export default function App() {
  return (
    <main className="page primary-reader">
      <a className="skip-link" href="#personal-edition">
        Skip to your edition
      </a>
      <header className="nav">
        <a className="brand" href="/" aria-label="Curio home">
          curio<span>.</span>
        </a>
        <span>A JOURNAL FOR THE CURIOUS</span>
        <a href="#personal-edition">Create an edition →</a>
      </header>
      <EditorialExperience />
      <footer>
        <strong>curio.</strong>
        <span>
          A slower way to discover. Your collection stays in this browser.
        </span>
      </footer>
    </main>
  );
}
