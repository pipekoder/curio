import { useEffect, useRef, useState } from "react";
import { curationCatalog, type CatalogItem } from "../shared/catalog";
import {
  defaultPreferences,
  editorialDemoCatalog,
  editorialPreferences,
  fallbackPlan,
  validatePlan,
  readCollection,
  categoryLabel,
  rankDemo,
  type EditorialEdition,
  type EditorialPreferences,
  type CollectionRecord,
} from "../shared/editorial";
import { lifestyles, categories } from "../shared/catalog";
import LivingAdvertisement from "./LivingAdvertisement";
import CatalogImage from "./CatalogImage";
import Attribution from "./Attribution";
const STORAGE = "curio.collection.v1";
export default function EditorialExperience() {
  const [prefs, setPrefs] = useState<EditorialPreferences>(defaultPreferences);
  const [edition, setEdition] = useState<EditorialEdition | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [panel, setPanel] = useState<string | null>(null),
    [topic, setTopic] = useState(""),
    [related, setRelated] = useState<CatalogItem[]>([]);
  const [saved, setSaved] = useState<CollectionRecord[]>(() => {
    try {
      return readCollection(localStorage.getItem(STORAGE));
    } catch {
      return [];
    }
  });
  const [shelf, setShelf] = useState("Field notes"),
    [storageError, setStorageError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    editionHeading = useRef<HTMLHeadingElement>(null);
  const requestId = useRef(0),
    branchId = useRef(0);
  useEffect(() => {
    if (panel && !dialog.current?.open) dialog.current?.showModal();
    if (!panel && dialog.current?.open) dialog.current.close();
  }, [panel]);
  useEffect(() => {
    if (!edition || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            observer.unobserve(e.target);
          }
        }),
      { threshold: 0.08 },
    );
    document
      .querySelectorAll(".feature-motion")
      .forEach((e) => observer.observe(e));
    return () => observer.disconnect();
  }, [edition]);
  const total = Object.values(prefs.allocations).reduce((a, b) => a + b, 0);
  async function create() {
    if (!editorialPreferences.safeParse(prefs).success || busy) return;
    setBusy(true);
    setMessage("");
    const id = ++requestId.current;
    let result: EditorialEdition = {
      plan: fallbackPlan(prefs),
      items: editorialDemoCatalog,
      source: "deterministic",
      retrieval: "fictional",
      cached: false,
    };
    try {
      const response = await fetch("/api/editorial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) {
        const data = (await response.json()) as EditorialEdition;
        if (
          !["meta", "deterministic"].includes(data.source) ||
          !["d1", "fictional"].includes(data.retrieval)
        )
          throw Error("Invalid source");
        result = {
          ...data,
          items: curationCatalog.filter((a) =>
            data.items.some(
              (item) => item.id === a.id && item.image.id === a.image.id,
            ),
          ),
          plan: validatePlan(
            data.plan,
            curationCatalog.filter(
              (a) =>
                prefs.allocations[a.category] > 0 &&
                data.items.some(
                  (item) => item.id === a.id && item.image.id === a.image.id,
                ),
            ),
          ),
        };
      }
    } catch {
      /* Fully local deterministic edition remains available offline. */
    }
    if (id !== requestId.current) return;
    setEdition(result);
    setBusy(false);
    setMessage(
      result.source === "meta"
        ? "Your Muse Spark edition is ready."
        : "Your authored fallback edition is ready.",
    );
    requestAnimationFrame(() => editionHeading.current?.focus());
  }
  function persist(next: CollectionRecord[]) {
    setSaved(next);
    try {
      if (next.length) localStorage.setItem(STORAGE, JSON.stringify(next));
      else localStorage.removeItem(STORAGE);
      setStorageError("");
    } catch {
      setStorageError(
        "Storage is unavailable. Your collection is kept only for this session.",
      );
    }
  }
  function save(ad: CatalogItem, kind: CollectionRecord["kind"]) {
    if (saved.some((s) => s.assetId === ad.image.id && s.kind === kind)) {
      setMessage("Already in your collection.");
      return;
    }
    if (saved.length >= 60) {
      setStorageError(
        "Your collection holds 60 items. Remove an item to make room.",
      );
      return;
    }
    persist([
      ...saved,
      {
        assetId: ad.image.id,
        kind,
        shelf: shelf.trim().slice(0, 40) || "Field notes",
      },
    ]);
    setMessage("Saved to your collection.");
  }
  function openStory(ad: CatalogItem) {
    branchId.current++;
    setPanel(ad.id);
    setTopic("");
    setRelated(
      rankDemo({
        ...prefs,
        interests: ad.lifestyleTags.join(" "),
        allocations: { home: 34, fashion: 33, travel: 33 },
      })
        .filter((a) => a.id !== ad.id)
        .slice(0, 3),
    );
  }
  async function follow(ad: CatalogItem, theme: string) {
    setTopic(theme);
    const id = ++branchId.current;
    const next = {
      ...prefs,
      interests: theme,
      allocations: { home: 34, fashion: 33, travel: 33 },
      mode: "Balanced" as const,
      consent: false,
    };
    let ranked = rankDemo(next);
    try {
      const r = await fetch("/api/editorial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const d = (await r.json()) as EditorialEdition;
        const plan = validatePlan(d.plan, curationCatalog);
        ranked = plan.features.flatMap((f) =>
          curationCatalog.filter((a) => a.id === f.catalogId),
        );
      }
    } catch {
      /* Contextual local fallback. */
    }
    if (id === branchId.current)
      setRelated(ranked.filter((a) => a.id !== ad.id).slice(0, 3));
  }
  const story = curationCatalog.find((a) => a.id === panel);
  return (
    <section
      className="editorial-experience"
      aria-labelledby="personal-edition"
    >
      <div className="edition-intro">
        <p className="eyebrow">THE PERSONAL ISSUE / VOL. 01</p>
        <h2 id="personal-edition">
          A world shaped
          <br />
          by your eye.
        </h2>
        <p>Discover. Explore. Understand. Follow curiosity. Collect.</p>
        <button
          className="collection-open"
          onClick={() => setPanel("collection")}
        >
          Your collection ({saved.length})
        </button>
      </div>
      <div className="editorial-controls">
        <label>
          Your editorial interests
          <textarea
            value={prefs.interests}
            maxLength={1000}
            placeholder="Paper, quiet rooms, sculptural shapes…"
            onChange={(e) => setPrefs({ ...prefs, interests: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>Your visual language</legend>
          <div className="chips">
            {lifestyles.map((style) => (
              <button
                key={style}
                aria-pressed={prefs.aesthetics.includes(style)}
                className={`chip ${prefs.aesthetics.includes(style) ? "active" : ""}`}
                onClick={() =>
                  setPrefs({
                    ...prefs,
                    aesthetics: prefs.aesthetics.includes(style)
                      ? prefs.aesthetics.filter((s) => s !== style)
                      : [...prefs.aesthetics, style],
                  })
                }
              >
                {style}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Editorial direction</legend>
          <div className="direction">
            {(["Focused", "Balanced", "Surprise Me"] as const).map((mode) => (
              <button
                key={mode}
                aria-pressed={prefs.mode === mode}
                onClick={() => setPrefs({ ...prefs, mode })}
              >
                {mode}
                <small>
                  {mode === "Focused"
                    ? "A closer study"
                    : mode === "Balanced"
                      ? "Connections across worlds"
                      : "A little unexpected"}
                </small>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="editorial-mix">
          <legend>Your category emphasis · {total}%</legend>
          {categories.map((c) => (
            <label key={c}>
              {categoryLabel(c)}
              <input
                aria-label={`Editorial ${c} weight`}
                type="number"
                min="0"
                max="100"
                value={prefs.allocations[c]}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    allocations: {
                      ...prefs.allocations,
                      [c]: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          ))}
        </fieldset>
        <label className="consent">
          <input
            type="checkbox"
            checked={prefs.consent}
            onChange={(e) => setPrefs({ ...prefs, consent: e.target.checked })}
          />
          Allow this edition's preferences to be sent to Meta Muse Spark if
          enabled. Optional; avoid personal information. Local editions work
          without AI.
        </label>
        <button
          className="generate"
          disabled={busy || total !== 100 || !prefs.aesthetics.length}
          onClick={create}
        >
          {busy ? "Composing your issue…" : "Compose my edition →"}
        </button>
        <p role="status" className="edition-status">
          {message ||
            "The public demo uses authorized fictional illustrations. Real image candidates stay private."}
        </p>
      </div>
      {edition && (
        <div
          className={`personal-edition direction-${prefs.mode.toLowerCase().replaceAll(" ", "-")}`}
          aria-label="Personalized editorial edition"
        >
          <header className="issue-cover">
            <p className="eyebrow">CURIO / YOUR FIELD NOTES</p>
            <h2 ref={editionHeading} tabIndex={-1}>
              {edition.plan.title}
            </h2>
            <p>{edition.plan.deck}</p>
            <small>
              {edition.source === "meta"
                ? "AI-directed plan · authored copy"
                : "Deterministic authored edition · no AI output"}{" "}
              /{" "}
              {edition.retrieval === "d1"
                ? "approved catalog selection"
                : "fictional illustration library"}
            </small>
          </header>
          <nav className="edition-toc" aria-label="Edition contents">
            {edition.plan.features.map((feature, i) => {
              const ad = curationCatalog.find(
                (a) => a.id === feature.catalogId,
              )!;
              return (
                <a href={`#personal-${feature.assetId}`} key={feature.assetId}>
                  <CatalogImage ad={ad} />
                  <span>
                    {String(i + 1).padStart(2, "0")} / {ad.name}
                  </span>
                </a>
              );
            })}
          </nav>
          {edition.plan.features.map((feature, i) => {
            const ad = curationCatalog.find(
              (a) =>
                a.id === feature.catalogId && a.image.id === feature.assetId,
            )!;
            return (
              <article
                id={`personal-${feature.assetId}`}
                key={feature.assetId}
                className={`personal-feature composition-${feature.layout} feature-motion motion-${feature.motion}`}
                data-layout={feature.layout}
                aria-label={`${ad.name} feature`}
              >
                <div className="feature-index">
                  <span>
                    {String(i + 1).padStart(2, "0")} /{" "}
                    {categoryLabel(ad.category)}
                  </span>
                  <span>{feature.theme}</span>
                </div>
                <div className="feature-art">
                  <LivingAdvertisement ad={ad} eager={i === 0} />
                </div>
                <div className="feature-copy">
                  <p className="eyebrow">
                    {ad.sourceType === "synthetic_concept"
                      ? "A FICTIONAL VISUAL STUDY"
                      : ad.advertiser?.name}
                  </p>
                  <h3>{feature.headline}</h3>
                  <p className="feature-narrative">{feature.narrative}</p>
                  <p className="source-label">
                    {edition.source === "meta"
                      ? "AI-selected authored interpretation"
                      : "Authored interpretation"}{" "}
                    · no product or material claims
                  </p>
                  <Attribution ad={ad} />
                  <div className="feature-actions">
                    <button onClick={() => openStory(ad)}>
                      Explore the story
                    </button>
                    <button onClick={() => save(ad, "image")}>
                      {saved.some(
                        (s) => s.assetId === ad.image.id && s.kind === "image",
                      )
                        ? "Image collected"
                        : "Collect image"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <dialog
        ref={dialog}
        className="discovery-dialog"
        onClose={() => {
          setPanel(null);
          branchId.current++;
        }}
        aria-label={story ? `${story.name} story` : "Your collection"}
      >
        <button
          className="dialog-close"
          onClick={() => {
            setPanel(null);
            branchId.current++;
          }}
        >
          Close exploration
        </button>
        {story && (
          <>
            <p className="eyebrow">EXPLORE / UNDERSTAND</p>
            <h2>{story.name}</h2>
            <CatalogImage ad={story} eager />
            <Attribution ad={story} />
            <h3>Publisher record</h3>
            <p>
              {story.description}{" "}
              {story.image.role === "placeholder"
                ? "This is a Curio-authored illustration, with no verified real brand, designer, material specification or purchasable product."
                : "Only the reviewed publisher record and attribution are presented. Additional designer, material and manufacturing claims are omitted."}
            </p>
            <a
              href={
                story.image.role === "placeholder"
                  ? `/editorial-sources.html#${story.id}`
                  : (story.provenance.originalSourcePage ??
                    "/editorial-sources.html")
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Source: Curio illustration record ↗
            </a>
            <h3>A wider design conversation</h3>
            <p>
              Independent historical context: the V&amp;A describes Arts and
              Crafts as a late nineteenth-century British movement concerned
              with how objects were made. This contextual connection does not
              establish the origin, materials or influence of this fictional
              study.
            </p>
            <a
              href="https://www.vam.ac.uk/articles/arts-and-crafts-an-introduction"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source: V&amp;A — Arts and Crafts: an introduction ↗
            </a>
            <h3>An editorial reading</h3>
            <p>
              Authored interpretation: follow the relationship between the drawn
              silhouette and the space around it. What changes when you see it
              as a rhythm rather than an object?
            </p>
            <p className="source-label">
              Facts above are publisher records or cited historical context.
              This interpretation is subjective. No AI-generated factual
              enrichment is presented.
            </p>
            <h3>Follow your curiosity</h3>
            <p>
              Explore a detail or theme. These connections use catalog metadata;
              no segmentation call is made.
            </p>
            <div className="chips">
              {[
                ...story.discoverableObjects.map((o) => o.label),
                ...story.lifestyleTags,
              ].map((theme) => (
                <button
                  className="chip"
                  key={theme}
                  aria-pressed={topic === theme}
                  onClick={() => follow(story, theme)}
                >
                  {theme}
                </button>
              ))}
            </div>
            {topic && <p role="status">Following: {topic}</p>}
            <h4>Related discoveries</h4>
            <div className="related-rail">
              {related.map((ad) => (
                <button key={ad.id} onClick={() => openStory(ad)}>
                  <CatalogImage ad={ad} eager />
                  <span>{ad.name}</span>
                </button>
              ))}
            </div>
            <label>
              Collection name
              <input
                value={shelf}
                maxLength={40}
                onChange={(e) => setShelf(e.target.value)}
              />
            </label>
            <button onClick={() => save(story, "story")}>
              {saved.some(
                (s) => s.assetId === story.image.id && s.kind === "story",
              )
                ? "Story collected"
                : "Collect story"}
            </button>
          </>
        )}
        {panel === "collection" && (
          <>
            <p className="eyebrow">COLLECT / YOUR PRIVATE FIELD NOTES</p>
            <h2>Your collection</h2>
            <p>
              Saved only in this browser. No account, synchronization or
              tracking. Interests and AI prose are never stored.
            </p>
            {!saved.length && (
              <p>Your collection is waiting for a first discovery.</p>
            )}
            {[...new Set(saved.map((s) => s.shelf))].map((group) => (
              <section key={group}>
                <h3>{group}</h3>
                <div className="collection-grid">
                  {saved
                    .filter((s) => s.shelf === group)
                    .map((item) => {
                      const ad = curationCatalog.find(
                        (a) => a.image.id === item.assetId,
                      )!;
                      return (
                        <article key={`${item.assetId}-${item.kind}`}>
                          <CatalogImage ad={ad} />
                          <h4>{ad.name}</h4>
                          <p>
                            {item.kind === "story"
                              ? "Editorial story"
                              : "Image study"}
                          </p>
                          <button onClick={() => openStory(ad)}>
                            Continue exploring
                          </button>
                          <label>
                            Move to collection
                            <input
                              defaultValue={item.shelf}
                              maxLength={40}
                              onBlur={(e) =>
                                persist(
                                  saved.map((s) =>
                                    s === item
                                      ? {
                                          ...s,
                                          shelf:
                                            e.target.value.trim() ||
                                            "Field notes",
                                        }
                                      : s,
                                  ),
                                )
                              }
                            />
                          </label>
                          <button
                            onClick={() =>
                              persist(saved.filter((s) => s !== item))
                            }
                          >
                            Remove {item.kind}
                          </button>
                        </article>
                      );
                    })}
                </div>
              </section>
            ))}
            {!!saved.length && (
              <button onClick={() => persist([])}>
                Clear all saved discoveries
              </button>
            )}
          </>
        )}
        {storageError && <p role="status">{storageError}</p>}
      </dialog>
    </section>
  );
}
