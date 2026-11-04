# Curio

### An AI Editorial Engine

**Instantly personal. Editorially rich. Led by curiosity. Powered by Meta AI.**

Started: October 26, 2026 | Built for the Meta Hackathon ( Everything is developed starting from Oct 26, 2026 )

**[Experience Curio — Live Demo](https://curio.shuang-han807.workers.dev)** | **[View Source Code](https://github.com/pipekoder/curio)**

Curio is an AI-powered editorial engine that brings together the immediacy of artificial intelligence, the depth of traditional publishing, and the freedom of personal curiosity.

It transforms interests, visual content, brand stories, product information, and cultural context into personalized editorial experiences—created on demand and designed to invite exploration.

Instead of simply delivering answers or displaying information, Curio creates stories that encourage people to discover unexpected connections and follow their curiosity.

---

## 1. The Idea — Rethinking How We Discover Information

How do we consume information today?

**Social media?** Fast, engaging, and constantly updated. But often lacking depth.

**Traditional magazines?** Beautiful layouts, thoughtful storytelling, and strong editorial perspectives. But produced weeks or months before we read them.

**Blogs and newsletters?** Insightful and well-written, yet too often left unread in our inboxes.

**Search engines and AI assistants?** Instant access to seemingly endless information. But primarily designed to answer questions rather than invite unexpected discoveries.

**Traditional advertising?** Everywhere, competing for our attention, yet rarely revealing the stories, ideas, and people behind the images.

**And books?** When did we last open one simply out of curiosity?

Every format offers something valuable, but each has limitations.

**What if AI could bring the best of these experiences together?**

- The immediacy of AI.
- The relevance of personalization.
- The depth of thoughtful editorial content.
- The beauty of a magazine.
- The freedom to explore beyond what we initially searched for.

That's where Curio started.

## 2. What Curio Does

Curio turns a personal interest into an editorial journey.

**Express an interest → Discover visual content → Generate an editorial edition → Read → Explore → Follow your curiosity**

### Personalized Exploration

Readers begin with their own interests, themes, or questions. Rather than relying solely on algorithmic predictions, Curio uses their expressed curiosity to guide discovery.

### AI-Generated Editorial Editions

Curio creates editorial stories by combining eligible visual content with relevant brand and product information, structured visual observations, and supporting cultural context.

Readers can choose between two editorial modes:

- **Lite:** Muse Spark 1.3 serves as Chief Editor.
- **Hybrid:** Muse Wonder 1.0 serves as Chief Editor, with Muse Spark 1.3 providing editorial review and refinement.

The three-article experience creates interconnected stories supported by selected imagery and source references.

### Visual and Interactive Discovery

Curio invites readers to go beyond the written article.

Through visual intelligence, interactive details, and available product hotspots, images can become starting points for exploring objects, ideas, and connections.

### An Editorial Experience, Not Just Generated Text

Curio combines AI-generated narratives with visual layouts, image-led storytelling, structured editorial assessment, and source-aware exploration.

The objective is to create something closer to a personalized magazine than a conventional chatbot response.

## 3. Powered by Meta AI

Meta's specialized AI models provide the foundation for Curio's editorial creation, multimodal understanding, and interactive visual exploration.

### Muse Wonder 1.0 — Hybrid Chief Editor

Muse Wonder acts as Chief Editor in Hybrid mode, synthesizing complex inputs—including user preferences, brand and product stories, visual intelligence, and supporting cultural sources—into cohesive, interconnected editorial narratives.

Its role is to develop original editorial perspectives that go beyond simply describing products or summarizing information.

### Muse Spark 1.3 — Lite Chief Editor and Editorial Intelligence

Muse Spark acts as Chief Editor in Lite mode and supports the editorial review workflow across both modes.

Its responsibilities include:

- **Independent Review:** Evaluating the editorial draft and identifying opportunities for improvement.
- **Structured Scoring:** Assessing editorial quality, discovery value, originality, narrative coherence, and readability.
- **Targeted Revision:** Improving storytelling based on reviewer feedback while preserving approved imagery and factual references.
- **Final Confirmation:** Independently evaluating the revised editorial content.

Curio then applies deterministic validation and calculates the final weighted editorial score.

### Muse Spark 1.3 — Multimodal Visual Intelligence

Muse Spark also analyzes approved visual content.

It extracts structured observations about subjects, material appearances, environments, and visual relationships.

Curio uses these observations to enrich editorial storytelling and connect visual details with relevant information.

Multiple image-analysis tasks can run concurrently, making visual preparation more efficient.

### SAM 3.1 — Object-Level Visual Discovery

SAM 3.1 supports product localization within approved imagery.

Curio uses this capability to generate interactive hotspots, allowing readers to explore specific objects and related information.

Hotspot analysis is scheduled asynchronously after editorial validation, so it does not delay article publication.

### Why Meta AI?

What makes Meta's approach particularly valuable is the combination of specialized, complementary AI capabilities accessible through APIs.

Instead of depending on one general-purpose model for every task, Curio assigns distinct responsibilities to models suited to editorial creation, critical review, visual understanding, and object localization.

This modular approach makes sophisticated AI capabilities accessible to independent developers and allows us to focus on creating new experiences rather than building foundational AI infrastructure.

## 4. How the Editorial Engine Works

Curio uses a multi-stage editorial workflow that combines generative AI with structured critical evaluation.

**User Interest + Approved Visual & Factual Evidence**

↓

**Chief Editor — Muse Wonder or Muse Spark**

Creates the original editorial narratives, selecting relevant imagery and developing the editorial direction.

↓

**Independent Reviewer — Muse Spark**

Evaluates the content using Curio's five-dimensional Editorial Standard.

| Evaluation dimension | Weight |
|---|---:|
| Editorial Quality | 30% |
| Discovery Value | 25% |
| Originality | 20% |
| Narrative Coherence | 15% |
| Readability | 10% |

↓

**Revision Editor — Muse Spark**

Uses the Reviewer's structured findings to improve the articles. Revision is constrained to prose, preserving image identities, brand attribution, and source references.

↓

**Final Confirmation — Muse Spark**

Independently evaluates the revised edition.

↓

**Curio Validation & Scoring Engine**

Validates content structure, source relationships, and image identities, calculates the final weighted score, and assigns an editorial presentation label.

The current workflow uses one bounded revision round rather than unlimited generation and rewriting.

## 5. Technical Architecture

Curio combines multiple AI capabilities with a production-oriented orchestration and data infrastructure.

### Technology Stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Interactive experience | Three.js |
| Backend | Cloudflare Workers, Hono |
| Database | Cloudflare D1 |
| Media storage | Cloudflare R2 |
| AI models | Muse Wonder 1.0, Muse Spark 1.3, SAM 3.1 |
| AI orchestration | Structured model outputs, staged workflows, deterministic validation |
| Reliability | D1 job leases, checkpoints, inference-budget controls |

### Parallel Visual Intelligence

Curio can analyze multiple approved images concurrently through Muse Spark 1.3, extracting structured visual observations before composing an editorial edition.

### Controlled Concurrent Generation

The backend supports up to two active article-generation jobs through Cloudflare D1 atomic job claims.

Each editorial workflow remains sequential internally, ensuring that the Reviewer receives the Chief Editor's completed output and the Revision Editor receives the Reviewer's findings.

### Durable Generation and Recovery

For three-article generation, Curio stores completed editorial stages as durable D1 checkpoints.

If a workflow is interrupted, the system can resume from validated checkpoints rather than unnecessarily repeating completed model calls.

### Asynchronous Visual Enrichment

SAM 3.1 hotspot localization is scheduled as background work through Cloudflare Workers.

This separates the immediate editorial reading experience from additional visual processing.

### Evidence, Safety, and Responsible AI

Curio includes:

- Explicit consent for AI-generated editorial content.
- Approved and versioned image references.
- Separate permissions for image display and AI analysis.
- Structured editorial evidence and source validation.
- Deterministic checks on article and image identities.
- Server-side model credentials and controlled inference budgets.
- AI-content disclosure and transparent handling of unavailable features.

AI-generated interpretation is distinguished from factual information supplied by content owners or approved sources.

## 6. Impact & Research Hypothesis

Curio began with a question about the way people experience advertising and information.

Traditional advertising competes for attention. Search delivers answers. Social platforms encourage continuous consumption.

Could AI create an experience that encourages people to stop, explore, question, and discover?

Our central research question is:

**Can AI-powered exploration turn passive exposure into active discovery, while improving understanding, engagement, brand recall, and consumer trust?**

We believe a curiosity-driven editorial experience could help people engage with information in a more intentional and meaningful way.

For brands, it offers an opportunity to be discovered through relevant stories and ideas rather than exposure alone.

For readers, it creates the possibility of an information experience shaped by their own interests and curiosity.

This remains a product and research hypothesis. Curio does not yet claim experimentally measured improvements in brand recall, trust, or purchase intention.

## 7. Live Demo

### [Experience Curio](https://curio.shuang-han807.workers.dev)

The live demonstration showcases Curio's AI-powered editorial experience.

**Suggested journey:**

1. Start with an interest or select an exploration theme.
2. Choose Lite or Hybrid editorial mode.
3. Generate a personalized editorial edition.
4. Read the AI-created stories and explore their visual context.
5. Interact with available visual details and product hotspots.

Live generation depends on model availability, catalog eligibility, permissions, and configured inference limits.

## 8. Getting Started

### Requirements

- Node.js 22.12 or later.
- npm.
- Cloudflare resources and Meta API credentials for live inference.

### Local Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/pipekoder/curio.git
cd curio
npm ci
```

Start the local Cloudflare Worker:

```bash
npm run worker:dev
```

In another terminal, start the frontend:

```bash
npm run dev
```

The Vite frontend proxies `/api` requests to the local Worker.

### Validation

```bash
npm run typecheck
npm test
npm run build
npm run worker:check
npm run test:integration
```

The local validation commands do not require paid Meta inference.

API credentials must be configured server-side and must never be committed to the repository.

## 9. Current Scope & Limitations

Curio is a Hackathon prototype demonstrating an AI-native editorial discovery experience.

Some brand, product, and catalog information is owner-created demonstration content rather than independently verified commercial information.

AI-generated narratives may contain inaccuracies. Image analysis and interactive product features depend on eligible, approved assets and successful processing.

The project demonstrates a technical and experiential approach to personalized discovery, but its impact on reader behavior, brand awareness, and consumer trust has not yet been experimentally validated.

## 10. Further Documentation

For implementation details, architecture, and operational guidance:

- [Editorial Article Workflow](docs/full-catalog-articles.md)
- [Muse Model Routing](docs/editorial-dual-model-contract.md)
- [Visual Intelligence and SAM](docs/PR17_VISUAL_INTELLIGENCE.md)
- [Cloudflare D1 Catalog](docs/CATALOG_D1.md)
- [Database Production Runbook](docs/D1_PRODUCTION_RUNBOOK.md)

---

## 11. Development & Attribution

Curio was started in October 2026 as an independent project for the Meta Hackathon, developed and maintained by **[@pipekoder](https://github.com/pipekoder)**.

**Commit attribution note:** During development, a one-letter typo in the Git author email configured by the AI coding assistant caused several commits to be incorrectly attributed to another GitHub account (`Sakhawat134`). These commits were part of Curio's development under `pipekoder` and do not represent contributions from that account.

The Git author configuration was subsequently corrected, and all commits made afterward have been attributed to the correct identity. And the issue has been reported to Github.

At the time these attribution errors occurred, the repository was **private, with no access granted to external collaborators**. Public access to the repository was first enabled on **November 4, 2026**.

The incorrect attribution was solely a Git metadata configuration issue and does not reflect external contributions or any change in project ownership.


### Curio

**Instantly personal. Editorially rich. Led by curiosity.**

*Built with Meta AI for the Meta Hackathon.*

