import { DiscoverPreview } from './DiscoverPreview';
import { ReaderCatalogContext } from './ReaderCatalog';
import { loadReaderItems } from './load-reader-catalog';
import { readerApprovals } from '../shared/reader-catalog';
import { approvedExternalAssets } from '../shared/url-policy';
import { editorialPrompt, interpretEditorialPrompt, promptSuggestions, PromptIntentError } from "../shared/editorial-intent";
import { authoredVisualContext, visualLabel } from "../shared/visual-observations";
import { useEffect, useRef, useState } from "react";
import { curationCatalog as staticCatalog, type CatalogItem } from "../shared/catalog";
import {
  defaultPreferences,
  editorialDemoCatalog,
  fallbackPlan,
  validatePlan,
  validateOriginalPlan,
  readCollection,
  categoryLabel,
  rankDemo,
  type EditorialEdition,
  type EditorialPreferences,
  type CollectionRecord,
} from "../shared/editorial";
import LivingAdvertisement from "./LivingAdvertisement";
import {VisualGenerate, VisualReader, VisualJourney, VisualCollect} from './VisualStages';
import CatalogImage from "./CatalogImage";
import Attribution from "./Attribution";
import { chairDemo, chairDemoDetails } from './chair-demo';
const STORAGE = "curio.collection.v1";
const localReaderCatalog = [...staticCatalog, chairDemo];
export default function EditorialExperience({discoverReview=false}:{discoverReview?:boolean}) {
  const [visualScreen,setVisualScreen]=useState<'discover'|'read'>('discover');
  const [readerCatalog,setReaderCatalog]=useState({items:localReaderCatalog,approvals:approvedExternalAssets});
  const curationCatalog=readerCatalog.items;
  const readerApprovalsCurrent=readerCatalog.approvals;
  const [prompt, setPrompt] = useState("");
  const [consent, setConsent] = useState(false);
  const [promptError, setPromptError] = useState("");
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const [prefs, setPrefs] = useState<EditorialPreferences>(defaultPreferences);
  const [editionMode, setEditionMode] =
    useState<EditorialPreferences["mode"]>("Balanced");
  const [edition, setEdition] = useState<EditorialEdition | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [visualThread, setVisualThread] = useState<{ detail: string; relationship: string } | null>(null);
  const [panel, setPanel] = useState<string | null>(null),
    [topic, setTopic] = useState(""),
    [related, setRelated] = useState<CatalogItem[]>([]);
  const [saved, setSaved] = useState<CollectionRecord[]>(() => {
    try {
      return readCollection(localStorage.getItem(STORAGE), localReaderCatalog);
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
    let active=true;
    try {
      const raw=localStorage.getItem(STORAGE), values=JSON.parse(raw??'[]') as unknown;
      if(Array.isArray(values)) {
        const ids=values.slice(0,60).flatMap(v=>v&&typeof v==='object'&&'assetId' in v&&typeof v.assetId==='string'?[v.assetId]:[]);
        if(ids.some(id=>/^version-[a-f0-9]{64}$/.test(id)))void loadReaderItems(ids).then(items=>{if(active&&items.length){const combined=[...localReaderCatalog,...items],approvals={...approvedExternalAssets,...readerApprovals(items)};setReaderCatalog({items:combined,approvals});setSaved(readCollection(raw,combined,approvals));}}).catch(()=>{});
      }
    }catch{/* corrupt/blocked storage remains private */}
    return()=>{active=false;};
  }, []);
  useEffect(() => {
    if (panel && dialog.current) {
      if (!dialog.current.open) dialog.current.showModal();
      dialog.current.scrollTop = 0;
      dialog.current
        .querySelector<HTMLElement>("h2")
        ?.focus({ preventScroll: true });
    }
    if (!panel && dialog.current?.open) dialog.current.close();
  }, [panel]);
  useEffect(() => {
    if (edition) editionHeading.current?.focus();
  }, [edition]);
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
  async function create() {
    if (busy) return;
    let preferences: EditorialPreferences;
    try { preferences = interpretEditorialPrompt({ prompt, consent }); }
    catch (error) { setPromptError(error instanceof PromptIntentError ? error.message : "Describe what you’d like to discover in up to 1,000 characters."); promptInput.current?.focus(); return; }
    setPromptError("");
    setBusy(true);
    setMessage("");
    const id = ++requestId.current;
    let result: EditorialEdition = {
      plan: fallbackPlan(preferences),
      items: editorialDemoCatalog,
      source: "deterministic",
      retrieval: "fictional",
      cached: false,
    };
    try {
      const response = await fetch("/api/editorial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: preferences.interests, consent }),
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) {
        const data = (await response.json()) as EditorialEdition;
        if (
          !["meta", "deterministic"].includes(data.source) ||
          !["d1", "fictional"].includes(data.retrieval)
        )
          throw Error("Invalid source");
        const unknown=[...new Set([...curationCatalog.filter(a=>/^version-[a-f0-9]{64}$/.test(a.image.id)).map(a=>a.image.id),...data.items.filter(a=>!curationCatalog.some(x=>x.image.id===a.image.id)).map(a=>a.image.id)])];
        const published=unknown.length?await loadReaderItems(unknown):[];
        const currentItems=unknown.length?[...localReaderCatalog,...published]:curationCatalog;
        const approvals=unknown.length?{...approvedExternalAssets,...readerApprovals(published)}:readerApprovalsCurrent;
        if(unknown.length){setReaderCatalog({items:currentItems,approvals});setSaved(previous=>previous.filter(s=>currentItems.some(a=>a.image.id===s.assetId)));}
        const allowed = currentItems.filter(
          (a) =>
            a.id !== chairDemo.id &&
            preferences.allocations[a.category] > 0 &&
            data.items.some(
              (item) => item.id === a.id && item.image.id === a.image.id,
            ),
        );
        result = {
          ...data,
          items: allowed,
          plan:
            data.source === "meta"
              ? validateOriginalPlan(data.plan, allowed, preferences,approvals)
              : validatePlan(data.plan, allowed,approvals),
        };
      }
    } catch {
      /* Fully local deterministic edition remains available offline. */
    }
    if (id !== requestId.current) return;
    setPrefs(preferences);
    setEditionMode(preferences.mode);
    setEdition(result);
    if(discoverReview)setVisualScreen('read');
    setBusy(false);
    setMessage(
      result.source === "meta"
        ? "Your Muse Spark edition is ready."
        : "Your authored fallback edition is ready.",
    );
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
  function openStory(ad: CatalogItem, thread: { detail: string; relationship: string } | null = null) {
    setVisualThread(thread);
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
        const ids=[...new Set([...curationCatalog.filter(a=>/^version-[a-f0-9]{64}$/.test(a.image.id)).map(a=>a.image.id),...d.items.map(a=>a.image.id).filter(id=>/^version-[a-f0-9]{64}$/.test(id))])];
        const published=ids.length?await loadReaderItems(ids):[];
        const current=ids.length?[...localReaderCatalog,...published]:curationCatalog;
        const approvals=ids.length?{...approvedExternalAssets,...readerApprovals(published)}:readerApprovalsCurrent;
        if(ids.length){setReaderCatalog({items:current,approvals});setSaved(previous=>previous.filter(s=>current.some(a=>a.image.id===s.assetId)));}
        const plan = validatePlan(d.plan, current.filter(a=>a.id!==chairDemo.id),approvals);
        ranked = plan.features.flatMap((f) =>
          current.filter((a) => a.id === f.catalogId),
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
    <ReaderCatalogContext.Provider value={readerCatalog}><section
      className="editorial-experience"
      aria-labelledby="personal-edition"
    >
      {discoverReview ? busy ? <VisualGenerate prompt={prompt} consent={consent}/> : visualScreen==='read'&&edition ? <VisualReader edition={edition} pool={curationCatalog} headingRef={editionHeading} onStory={(ad,thread)=>openStory(ad,thread??null)} onCollect={ad=>save(ad,'image')} onCollection={()=>setPanel('collection')} onRefine={()=>{setVisualScreen('discover');requestAnimationFrame(()=>promptInput.current?.focus())}}/> : <DiscoverPreview prompt={prompt} consent={consent} busy={busy} error={promptError} promptRef={promptInput} onPrompt={value=>{setPrompt(value);setConsent(false);setPromptError("")}} onConsent={setConsent} onSubmit={()=>{void create()}} onCollection={()=>setPanel("collection")} /> : <>
      <div className="edition-intro">
        <p className="eyebrow">FROM ADVERTISING TO DISCOVERY</p>
        <div className="opening-copy">
          <h1 id="personal-edition" tabIndex={-1}>
            Follow your <em>curiosity.</em>
          </h1>
          <p className="opening-deck">
            One prompt. A visual magazine. A trail of discoveries.
          </p>
          <p className="opening-caption">
            Original illustrations. A new point of view.
          </p>
        </div>
        <div
          className="opening-art"
          aria-label="Preview of authorized fictional studies"
        >
          {editorialDemoCatalog
            .filter((ad) => ad.id === "home-lamp" || ad.id === "travel-cabin")
            .map((ad) => (
              <CatalogImage key={ad.image.id} ad={ad} eager />
            ))}
          <span>THE ART OF NOTICING / 01</span>
        </div>
        <button
          className="collection-open"
          onClick={() => setPanel("collection")}
        >
          Your collection ({saved.length})
        </button>
      </div>
      <form className="editorial-controls prompt-composer" id="edition-builder" onSubmit={event => { event.preventDefault(); void create(); }}>
        <div className="builder-heading">
          <p className="eyebrow">01 / FOLLOW AN IDEA</p>
          <h2>What would you like to discover?</h2>
          <p id="prompt-help">Describe a mood, an interest, or a connection. We’ll turn it into a visual magazine.</p>
        </div>
        <label className="prompt-label" htmlFor="discovery-prompt">Your discovery prompt</label>
        <textarea ref={promptInput} id="discovery-prompt" value={prompt} maxLength={1000} rows={4} required disabled={busy}
          aria-describedby="prompt-help prompt-privacy" aria-invalid={Boolean(promptError)}
          placeholder="A quiet world of paper lamps, reading rooms and Scandinavian simplicity…"
          onChange={event => { setPrompt(event.target.value); setConsent(false); setPromptError(""); }}
          onKeyDown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        <div className="prompt-suggestions" role="group" aria-label="Prompt inspiration">
          {promptSuggestions.map(suggestion => <button type="button" key={suggestion.name} disabled={busy} aria-label={`Try a prompt: ${suggestion.name}`}
            onClick={() => { setPrompt(suggestion.text); setConsent(false); setPromptError(""); promptInput.current?.focus(); }}>{suggestion.name} <span aria-hidden="true">→</span></button>)}
        </div>
        <label className="consent" id="prompt-privacy">
          <input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />
          Use Meta AI for this prompt, if available. Optional; avoid personal information. Leave unchecked for an edition without AI.
        </label>
        {promptError && <p className="prompt-error" role="alert">{promptError}</p>}
        <button type="submit" className="generate" disabled={busy || !editorialPrompt.safeParse({ prompt, consent }).success}>
          {busy ? "Composing your issue…" : "Generate magazine →"}
        </button>
        <p role="status" className="edition-status">{message || "Start with your own words. Only authorized imagery appears in your edition."}</p>
      </form></>}
      {!discoverReview && edition && (
        <div
          className={`personal-edition direction-${editionMode.toLowerCase().replaceAll(" ", "-")}`}
          aria-label="Personalized editorial edition"
        >
          <header className="issue-cover">
            <div className="cover-copy">
            <p className="eyebrow">CURIO / YOUR FIELD NOTES</p>
            <h2 ref={editionHeading} tabIndex={-1}>
              {edition.plan.title}
            </h2>
            <p>{edition.plan.deck}</p>
            <small>
              {edition.source === "meta"
                ? "AI-generated visual interpretation"
                : "Curio-authored edition · AI not used"}{" "}
              /{" "}
              {edition.retrieval === "d1"
                ? "approved catalog selection"
                : "fictional illustration library"}
            </small>
            </div>
            <div className="cover-contact-sheet" aria-label="A preview of your visual edition">
              {edition.plan.features.slice(0, 2).map((f, i) => {
                const ad = curationCatalog.find(a => a.image.id === f.assetId);if(!ad)return null;
                return <div key={f.assetId}><CatalogImage ad={ad} eager /><span>{String(i + 1).padStart(2, "0")} / {ad.name}</span></div>;
              })}
              <p>LOOK / CONNECT / DISCOVER</p>
            </div>
          </header>
          <button className="refine-edition" onClick={() => { promptInput.current?.scrollIntoView({ block: "center" }); promptInput.current?.focus(); }}>Refine with a new prompt ↑</button>
          <nav className="edition-toc" aria-label="Edition contents">
            {edition.plan.features.map((feature, i) => {
              const ad = curationCatalog.find(
                (a) => a.id === feature.catalogId,
              );
              if(!ad)return null;
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
            );
            if(!ad)return null;
            const visualContext = authoredVisualContext(ad);
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
                  <LivingAdvertisement ad={ad} eager={i === 0} onExploreStory={(next, detail, relationship) => openStory(next, { detail, relationship })} />
                </div>
                <div className="feature-copy">
                  <p className="eyebrow">
                    {ad.sourceType === "synthetic_concept"
                      ? "A FICTIONAL VISUAL STUDY"
                      : ad.advertiser?.name}
                  </p>
                  <h3>{feature.headline}</h3>
                  <p className="feature-narrative">{feature.narrative}</p>
                  {feature.discoveryQuestion && <button type="button" className="editorial-curiosity" onClick={() => openStory(ad)}>{feature.discoveryQuestion} →</button>}
                  <p className="source-label">
                    {edition.source === "meta"
                      ? "AI-generated hypothetical interpretation"
                      : "Authored interpretation"}{" "}
                    · no product or material claims
                  </p>
                  {visualContext && <div className="visual-reading-note">
                    <span className="eyebrow">A WAY OF SEEING</span>
                    <p>{visualContext.observations.relationships.map(visualLabel).join(" / ")}</p>
                    <small>Follow a small light in the image to explore a visual thread.</small>
                  </div>}
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
        {discoverReview&&story&&<VisualJourney story={story} related={related} topic={topic} onRelated={next=>openStory(next)} onFollow={theme=>{void follow(story,theme)}} onCollect={()=>save(story,'story')}/>}
        {discoverReview&&panel==='collection'&&<VisualCollect savedCount={saved.length} current={curationCatalog.find(a=>a.image.id===saved[0]?.assetId)??null} onDiscover={()=>{setPanel(null);setVisualScreen('discover')}} onOpen={()=>{const ad=curationCatalog.find(a=>a.image.id===saved[0]?.assetId);if(ad)openStory(ad)}} onRemove={()=>persist(saved.slice(1))}/>}
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
            <h2 tabIndex={-1}>{story.name}</h2>
            {visualThread && <aside className="visual-story-arrival" role="status">
              <p className="eyebrow">YOUR VISUAL THREAD</p>
              <p>From {visualThread.detail} to {visualLabel(visualThread.relationship)}.</p>
              <p>{story.id===chairDemo.id?'Compare the photographed chair with related Curio stories. The product identity and connection are fictional demo interpretations.':'Compare the drawn forms, then explore the context below. This is an authored connection, not a verified relationship between real products.'}</p>
            </aside>}
            <CatalogImage ad={story} eager />
            <Attribution ad={story} />
            <div className="story-chapter">
              <span>01 / THE RECORD</span>
              <h3>{story.id===chairDemo.id?'Fictional demo record':'Publisher record'}</h3>
            </div>
            <p>
              {story.description}{" "}
              {story.id === chairDemo.id
                ? "This is a fictional Curio demo concept, not a verified merchant product. The maker, specifications, availability and material are unverified."
                : story.image.role === "placeholder"
                ? "This is a Curio-authored illustration, with no verified real brand, designer, material specification or purchasable product."
                : "Only the reviewed publisher record and attribution are presented. Additional designer, material and manufacturing claims are omitted."}
            </p>
            {story.id === chairDemo.id && <aside className="chair-demo-story-facts"><p>Fictional demo price: {new Intl.NumberFormat('en-US',{style:'currency',currency:chairDemoDetails.price.currency}).format(chairDemoDetails.price.amount)} USD. Not purchasable.</p><ul>{chairDemoDetails.assumptions.map(a=><li key={a}>{a}</li>)}</ul><p>These attributes are fictional assumptions or visual observations, not verified product facts.</p></aside>}
            {story.id !== chairDemo.id && <a
              href={
                story.image.role === "placeholder"
                  ? `/editorial-sources.html#${story.id}`
                  : (story.provenance.originalSourcePage ??
                    "/editorial-sources.html")
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Source: {story.image.role === 'placeholder' ? 'Curio illustration record' : 'Publisher record'} →
            </a>}
            {story.id === chairDemo.id && <p className="source-label">Source: Owner-supplied editorial photograph. Product identity and price are fictional demo data.</p>}
            <div className="story-chapter">
              <span>02 / THE CONTEXT</span>
              <h3>A wider design conversation</h3>
            </div>
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
              Source: V&amp;A — Arts and Crafts: an introduction →
            </a>
            <h3>An editorial reading</h3>
            {edition?.source === "meta" &&
              edition.plan.features.find(
                (f) => f.assetId === story.image.id,
              ) && (
                <aside className="original-interpretation">
                  <p className="eyebrow">
                    MUSE SPARK / ORIGINAL INTERPRETATION
                  </p>
                  <p>
                    {
                      edition.plan.features.find(
                        (f) => f.assetId === story.image.id,
                      )!.narrative
                    }
                  </p>
                  <p className="source-label">
                    Hypothetical visual language, not a sourced factual claim.
                  </p>
                </aside>
              )}
            <p>
              {story.id===chairDemo.id
                ? 'Authored interpretation: follow how the curved seat, bright archway and low furniture create a sense of shelter within an open view. This describes the photograph, not a verified product specification.'
                : 'Authored interpretation: follow the relationship between the drawn silhouette and the space around it. What changes when you see it as a rhythm rather than an object?'}
            </p>
            <p className="source-label">
              {story.id===chairDemo.id
                ? 'The product record is fictional. Historical context is independently cited; visual interpretation is subjective. No AI-generated factual enrichment is presented.'
                : 'Facts above are publisher records or cited historical context. This interpretation is subjective. No AI-generated factual enrichment is presented.'}
            </p>
            <div className="story-chapter">
              <span>03 / YOUR NEXT THREAD</span>
              <h3>Follow your curiosity</h3>
            </div>
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
            {edition?.plan.connections
              ?.filter((c) => c.fromAssetId === story.image.id)
              .map((c) => {
                const next = curationCatalog.find(
                  (a) => a.image.id === c.toAssetId,
                );
                return next ? (
                  <aside key={c.toAssetId} className="curiosity-thread">
                    <p className="eyebrow">AN EDITORIAL THREAD</p>
                    <p>{c.thread}</p>
                    <button onClick={() => openStory(next)}>
                      Follow the thread: {next.name} →
                    </button>
                  </aside>
                ) : null;
              })}
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
            <h2 tabIndex={-1}>Your collection</h2>
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
                    .filter((s) => s.shelf === group&&curationCatalog.some(a=>a.image.id===s.assetId))
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
    </section></ReaderCatalogContext.Provider>
  );
}
