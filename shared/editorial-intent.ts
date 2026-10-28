import { z } from "zod";
import { editorialPreferences, type EditorialPreferences } from "./editorial";
import { categories, type lifestyles } from "./catalog";
export const PROMPT_INTENT_VERSION = "curio-prompt-intent-v1";
export const editorialPrompt = z.strictObject({
  prompt: z.string().trim().min(1).max(1000).refine(s => [...s].every(c => { const code = c.charCodeAt(0); return code !== 127 && (code >= 32 || code === 9 || code === 10 || code === 13); }), "Use a readable prompt."),
  consent: z.boolean().default(false),
});
export const promptSuggestions = [
  { name: "Quiet rooms", text: "Create a quiet magazine about paper lamps and calm reading rooms, with Scandinavian simplicity. Focus on light and space." },
  { name: "Into the wild", text: "Surprise me with woodland paths and lakeside retreats, exploring nature, travel and unexpected connections." },
  { name: "Shape & style", text: "Explore sculptural fashion, flowing coats and folded bags, with quiet luxury and a playful eye for silhouette." },
] as const;
const themes = {
  home: "home|homes|interiors?|rooms?|lamps?|chairs?|furniture|reading|lighting|decor|architecture",
  fashion: "fashion|clothing|coats?|bags?|garments?|wardrobes?|tailoring|outfits?|silhouettes?",
  travel: "travel|outdoors?|nature|woodlands?|forests?|paths?|walking|lakesides?|retreats?|landscapes?|cabins?|journeys?",
} as const;
const aestheticRules: [typeof lifestyles[number], RegExp][] = [
  ["Japanese Wabi-Sabi", /\b(japanese|wabi[ -]?sabi|imperfect|weathered)\b/],
  ["Gaudí / Catalan Modernism", /\b(gaudi|catalan|modernism|organic curves)\b/],
  ["Scandinavian", /\b(scandinavian|scandi|nordic|simplicity|minimalism)\b/],
  ["French Style", /\b(french|parisian)\b/],
  ["British Vintage & Eclectic", /\b(british|vintage|eclectic)\b/],
  ["Quiet Luxury", /\b(quiet luxury|understated|tailored)\b/],
  ["Urban Creative", /\b(urban|creative|street|playful|experimental)\b/],
  ["Nature & Outdoor", /\b(nature|outdoors?|woodlands?|forests?|landscapes?|lakesides?)\b/],
];
export class PromptIntentError extends Error {
  constructor() { super("Curio explores spaces, style and places. Include at least one of these in your prompt."); }
}
// Bounded deterministic intent inference, not an extra AI call. Never executes
// prompt instructions or accepts caller-supplied weights/tags through this shape.
// The original prompt remains untrusted context for the ONE editorial request.
export function interpretEditorialPrompt(input: unknown): EditorialPreferences {
  const { prompt, consent } = editorialPrompt.parse(input);
  const text = prompt.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[–—]/g, "-");
  const exclusionTerms = { home: "home|interiors?|rooms?", fashion: "fashion|clothing", travel: "travel|trips|destinations" };
  const excluded = new Set(categories.filter(c => new RegExp(`\\b(?:no|without|avoid|exclude|not(?! only))\\s+(?:any\\s+)?(?:${exclusionTerms[c]})\\b`).test(text)));
  if (excluded.size === categories.length) throw new PromptIntentError();
  const scores = categories.map(c => excluded.has(c) ? 0 : [...text.matchAll(new RegExp(`\\b(?:${themes[c]})\\b`, "g"))].length);
  categories.forEach((c,i) => {
    if (scores[i] && new RegExp(`\\b(?:mostly|mainly|especially|focus on)\\s+(?:${themes[c]})\\b`).test(text)) scores[i] *= 3;
  });
  const hasCategory = scores.some(Boolean);
  if (!hasCategory) categories.forEach((c,i) => { scores[i] = excluded.has(c) ? 0 : 1; });
  const total = scores.reduce((a,b) => a+b,0);
  const allocations = { home: 0, fashion: 0, travel: 0 };
  let assigned = 0;
  categories.forEach((c,i) => { allocations[c] = Math.floor(scores[i]/total*100); assigned += allocations[c]; });
  // Allocate rounding residue only to nonzero categories, never excluded ones.
  for (const c of categories.filter((_,i) => scores[i] > 0)) {
    if (assigned === 100) break;
    allocations[c]++; assigned++;
  }
  const active = categories.filter(c => allocations[c] > 0);
  const aestheticText = text.replace(/\b(?:no|not|avoid|without|exclude)\s+(?:any\s+)?[a-z-]+/g, "");
  const aesthetics = aestheticRules.filter(([,rule]) => rule.test(aestheticText)).map(([name]) => name);
  if (!aesthetics.length) aesthetics.push(active.length === 1 && active[0] === "travel" ? "Nature & Outdoor" : active.length === 1 && active[0] === "fashion" ? "Quiet Luxury" : "Scandinavian");
  const mode = /\b(surprise|unexpected|experimental|playful|explore|adventure)\b/.test(text) ? "Surprise Me" : /\b(balanced|across|variety|connections)\b/.test(text) ? "Balanced" : active.length === 1 || /\b(focus|focused|closer|only)\b/.test(text) ? "Focused" : "Balanced";
  return editorialPreferences.parse({ interests: prompt, aesthetics, allocations, mode, consent });
}
export function resolveEditorialInput(input: unknown): EditorialPreferences {
  if (typeof input === "object" && input !== null && "prompt" in input) return interpretEditorialPrompt(input);
  // Existing internal/operator callers retain the same strict preference schema.
  return editorialPreferences.parse(input);
}
