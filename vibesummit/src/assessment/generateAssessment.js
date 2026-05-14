import { nowMs, persistAppDatabase } from "../db/index.js";
import { slideLayoutFromPresentation } from "./presentation.js";
import { computeOceanScores } from "./scoring.js";
import { lastInsertRowId, queryAll } from "./sqliteUtil.js";

/**
 * @param {import("sql.js").Database} db
 * @param {number[]} presentationIds Base question ids 1–30 (optionally +30 for reversed layout).
 * @returns {{ slides: object[], scoringSlides: import("./scoring.js").ScoringSlide[] }}
 */
export function buildSlidesFromPresentationIds(db, presentationIds) {
  /** @type {import("./scoring.js").ScoringSlide[]} */
  const scoringSlides = [];
  const slides = [];

  for (const pid of presentationIds) {
    const baseId = pid > 30 ? pid - 30 : pid;
    const row = queryAll(db, "SELECT question_id, high_first, ocean_score FROM questions WHERE question_id = ?", [baseId])[0];
    if (!row) throw new Error(`Missing question for presentation ${pid}`);

    const highFirstBool = Number(row.high_first) === 1;
    const oceanScore = Number(row.ocean_score);
    const layout = slideLayoutFromPresentation(pid, Number(row.high_first) === 1 ? 1 : 0);

    scoringSlides.push({
      presentationId: pid,
      oceanScore,
      highFirst: highFirstBool,
      reversed: layout.reversed,
    });

    slides.push({
      presentationId: pid,
      baseQuestionId: layout.baseQuestionId,
      oceanScore,
      highFirst: highFirstBool,
      reversed: layout.reversed,
      leftSrc: layout.leftSrc,
      rightSrc: layout.rightSrc,
    });
  }

  return { slides, scoringSlides };
}

/**
 * @param {import("sql.js").Database} db
 * @param {{ badgeId: string, displayName?: string, assessmentId: number, choices: (0|1)[], scoringSlides: import("./scoring.js").ScoringSlide[] }} args
 * @returns {{ dbUserId: number, oceanScores: { o: number, c: number, e: number, a: number, n: number } }}
 */
export function finalizeAssessment(db, { badgeId, displayName = "", assessmentId, choices, scoringSlides }) {
  const ts = nowMs();
  const oceanScores = computeOceanScores(scoringSlides, choices);

  db.run("BEGIN");
  db.run("INSERT INTO users (assessment_id, badge_id, display_name, answers, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [
    assessmentId,
    badgeId,
    String(displayName || "").trim(),
    JSON.stringify(choices),
    ts,
    ts,
  ]);
  const dbUserId = lastInsertRowId(db);

  db.run("INSERT INTO user_vibe (user_id, o_score, c_score, e_score, a_score, n_score) VALUES (?, ?, ?, ?, ?, ?)", [
    dbUserId,
    oceanScores.o,
    oceanScores.c,
    oceanScores.e,
    oceanScores.a,
    oceanScores.n,
  ]);
  db.run("COMMIT");

  persistAppDatabase(db);

  return { dbUserId, oceanScores };
}
