// A generative visual lexicon, not a bank of complete sentences. Novel prose
// stays hypothetical; identity, materials, manufacturing, geography, dates and
// claims about actual image content are outside this public narrative channel.
export const VISUAL_LANGUAGE_VERSION = "visual-language-v1";
export const visualWords = new Set(
  `near round rounded holding softer calmer a an the and or but as if with without between within beyond around across through toward towards into from of for to in on at by is are be being feel feels feeling felt seem seems suggest suggests suggesting may might could can would will let lets us we our you your it its this that these those another together apart each every one two small large more less much little enough again only also even still just almost perhaps imagine consider what when where how why then than not no yet so now here there open quiet calm gentle subtle soft bold slow slower stillness pause pauses rhythm rhythms space spaces shape shapes form forms line lines curve curves edge edges silhouette silhouettes scale balance contrast harmony tension light shadow shadows shade glow depth surface surfaces layer layers distance nearness movement motion flow flowing drift drifting fold folds folded path paths threshold thresholds passage passages journey journeys direction directions return returning beginning beginnings ending endings linger lingering look looking closer notice wonder wondering curiosity curious possibility possibilities invitation invitations connection connections thread threads weave weaving explore exploring discovery discoveries discover follow following attention attentive eye eyes gaze visual composition compositions design idea ideas thought thoughts memory memories dream dreams dreaming imagined playful play restful restless thoughtful intimate generous spare spacious airy weight weightless grounded floating steady vivid muted warm warmth cool cooling familiar unfamiliar unexpected surprising surprise simple simplicity complex complexity elegant elegance detail details fragment fragments whole pattern patterns repeat repeating echo echoes echoing repeat repetition repeated breathe breathing breath room rooms corner corners view views scene scenes frame frames world worlds story stories moment moments presence absence meeting meet meeting invitation reflect reflection reflective response response dialogue conversation conversation sense senses sensing touch feeling ease energy order freedom spacious shelter sheltered outside inside nearby elsewhere same different difference slowly softly gently freely quietly lightly rhythmical subtlety fresh freshen natural nature landscape landscapes horizon horizons wander wandering walk walking way ways onward onwardness inward outward possibility imagine consider perhaps what could happen become becomes find finds allow allows let make makes turn turns bring brings hold holds held keep keeps give gives add adds take takes build builds read reading interpret interpretation interpretations think thinking offer offers move moves moving connect connects connecting ask asking dream dreaming abstract abstraction composition passage silence silent sound song verse poetry poetic spaciousness still through while rather because than until beneath above before after over under beside alongside once something anything nothing everything time timeless distance air openness almost start starting continue continuing curiosity quietness curiousness`.split(
    /\s+/,
  ),
);
export function visualPhrase(value: string) {
  if (!/^[A-Za-z ,;?.!]+$/.test(value) || value.length > 400) return false;
  const words = value.toLowerCase().match(/[a-z]+/g) ?? [];
  return (
    words.length >= 2 &&
    words.length <= 75 &&
    words.every((w) => visualWords.has(w))
  );
}
export function visualNarrative(value: string) {
  const sentences = value.match(/[^.!?]+[.!?]/g);
  return Boolean(
    sentences?.length &&
    sentences.length <= 2 &&
    sentences.join("") === value &&
    sentences.every(
      (s) =>
        /^\s*(Imagine|Consider|Perhaps|What if)\b/.test(s) &&
        visualPhrase(s) &&
        !/[A-Z]/.test(s.trim().slice(1)) &&
        s.trim().split(/\s+/).length >= 7,
    ),
  );
}
