import { userPickedHighPole } from "./presentation.js";

/**
 * @typedef {{ presentationId: number, oceanScore: number, highFirst: boolean, reversed: boolean }} ScoringSlide
 */

const TRAIT = ["o", "c", "e", "a", "n"];

/** Binary items per OCEAN facet when using the canonical test set (see `public/data/test_30_questions.csv`). */
export const ITEMS_PER_OCEAN_FACET = 6;

/** Must match the number of rows in `public/data/test_30_questions.csv` (excluding header). */
export const TOTAL_ASSESSMENT_QUESTIONS = ITEMS_PER_OCEAN_FACET * 5;

/**
 * Sum of “high pole” picks (0..{@link ITEMS_PER_OCEAN_FACET}) → 0, 20, 40, 60, 80, or 100.
 * @param {number} sum
 */
export function facetScoreFromHighPickSum(sum) {
  return Math.min(100, sum * 20);
}

/**
 * @param {ScoringSlide[]} slidesInOrder Same order as `choices`
 * @param {(0|1)[]} choices
 * @returns {{ o: number, c: number, e: number, a: number, n: number }} Each value in {0,20,40,60,80,100}
 */
export function computeOceanScores(slidesInOrder, choices) {
  /** @type {Record<string, number[]>} */
  const buckets = { o: [], c: [], e: [], a: [], n: [] };

  for (let i = 0; i < slidesInOrder.length; i++) {
    const slide = slidesInOrder[i];
    const choice = choices[i];
    const trait = TRAIT[Math.round(slide.oceanScore) % 5];
    const pickedHigh = userPickedHighPole(choice, slide.reversed, slide.highFirst);
    buckets[trait].push(pickedHigh ? 1 : 0);
  }

  return {
    o: facetScoreFromHighPickSum(buckets.o.reduce((a, b) => a + b, 0)),
    c: facetScoreFromHighPickSum(buckets.c.reduce((a, b) => a + b, 0)),
    e: facetScoreFromHighPickSum(buckets.e.reduce((a, b) => a + b, 0)),
    a: facetScoreFromHighPickSum(buckets.a.reduce((a, b) => a + b, 0)),
    n: facetScoreFromHighPickSum(buckets.n.reduce((a, b) => a + b, 0)),
  };
}

/**
 * @param {{ o: number, c: number, e: number, a: number, n: number }} s Facet scores in {0,20,…,100}
 */
export function vibeLabelFromOcean(s) {
  const hi = (k) => s[k] >= 60;
  const lo = (k) => s[k] <= 40;
  if (hi("e") && hi("o")) return "Social Explorer";
  if (lo("e") && hi("c")) return "Focused Builder";
  if (hi("a") && hi("o")) return "Warm Connector";
  if (hi("n")) return "High-Intensity Feeler";
  if (hi("c") && hi("a")) return "Steady Collaborator";
  if (hi("e")) return "Energetic Mixer";
  return "Balanced Conversationalist";
}
