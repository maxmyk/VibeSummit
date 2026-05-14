import { loadQuestionBankRows } from "./csvAssessmentData.js";

/**
 * Loads question definitions from `/public/data/questions.csv` into SQLite.
 * @param {import("sql.js").Database} db
 */
export async function ensureQuestionsSeeded(db) {
  const rows = await loadQuestionBankRows();

  db.run("BEGIN");
  db.run("DELETE FROM questions");

  const insert = db.prepare("INSERT INTO questions (question_id, high_first, ocean_score) VALUES (?, ?, ?)");
  for (const row of rows) {
    insert.run([row.questionId, row.highFirst, row.oceanScore]);
  }
  insert.free();
  db.run("COMMIT");
}
