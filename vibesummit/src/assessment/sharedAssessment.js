import { loadCanonicalTestQuestionIds } from "./csvAssessmentData.js";
import { buildSlidesFromPresentationIds } from "./generateAssessment.js";
import { nowMs, persistAppDatabase } from "../db/index.js";
import { lastInsertRowId, queryAll } from "./sqliteUtil.js";

const SHUFFLE_SEED = "vibesummit-shared-assessment-v1";

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

export function deterministicShuffle(ids, seedString) {
  const rand = mulberry32(hashSeed(seedString) | 0);
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function canonicalMultisetEqual(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

/**
 * Ensures a shared `assessments` row exists: canonical ids from `/public/data/test_30_questions.csv`,
 * deterministically shuffled; reuses a row if its id multiset matches the current CSV set.
 * @param {import("sql.js").Database} db
 */
export async function ensureSharedAssessment(db) {
  const want = await loadCanonicalTestQuestionIds();
  const wantLen = want.length;

  const candidates = queryAll(db, "SELECT assessment_id, question_ids FROM assessments WHERE question_count = ?", [wantLen]);
  for (const row of candidates) {
    let parsed;
    try {
      parsed = JSON.parse(String(row.question_ids));
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const ids = parsed.map((x) => Number(x));
    if (canonicalMultisetEqual(ids, want)) {
      const assessmentId = Number(row.assessment_id);
      const { slides, scoringSlides } = buildSlidesFromPresentationIds(db, ids);
      return { assessmentId, presentationIds: ids, slides, scoringSlides };
    }
  }

  const presentationIds = deterministicShuffle(want, SHUFFLE_SEED);
  const ts = nowMs();
  db.run(
    "INSERT INTO assessments (question_count, question_ids, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [presentationIds.length, JSON.stringify(presentationIds), ts, ts],
  );
  const assessmentId = lastInsertRowId(db);
  persistAppDatabase(db);

  const { slides, scoringSlides } = buildSlidesFromPresentationIds(db, presentationIds);
  return { assessmentId, presentationIds, slides, scoringSlides };
}

/**
 * @param {import("sql.js").Database} db
 */
export async function loadSharedAssessmentSession(db) {
  return ensureSharedAssessment(db);
}
