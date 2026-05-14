/** Maps CSV category labels to `questions.ocean_score` (0=O … 4=N). */
const CATEGORY_TO_OCEAN = {
  openness: 0,
  conscientiousness: 1,
  extraversion: 2,
  agreeableness: 3,
  neuroticism: 4,
};

function dataUrl(file) {
  const base = import.meta.env.BASE_URL || "/";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}data/${file}`;
}

async function fetchCsvText(file) {
  const url = dataUrl(file);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * @param {string} line
 * @returns {string[]}
 */
export function splitCsvLine(line) {
  const parts = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  parts.push(cur.trim());
  return parts.map((p) => p.replace(/^"|"$/g, ""));
}

/**
 * @param {string} csvText
 * @returns {{ questionId: number, highFirst: 0 | 1, oceanScore: number }[]}
 */
export function parseQuestionBankCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) throw new Error("questions.csv: expected header and at least one row");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 3) continue;
    const questionId = Number(cols[0]);
    const lowFirst = String(cols[1]).toLowerCase() === "true";
    const category = String(cols[2]).toLowerCase();
    if (!Number.isFinite(questionId)) continue;
    const key = category;
    if (!(key in CATEGORY_TO_OCEAN)) {
      throw new Error(`questions.csv: unknown category "${cols[2]}"`);
    }
    const oceanScore = CATEGORY_TO_OCEAN[key];
    const highFirst = lowFirst ? 0 : 1;
    out.push({ questionId, highFirst, oceanScore });
  }
  return out;
}

/**
 * @param {string} csvText
 * @returns {number[]} Base question ids in CSV row order (excluding header).
 */
export function parseTest30QuestionIds(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) throw new Error("test_30_questions.csv: expected header and at least one row");
  const ids = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (!cols.length) continue;
    const id = Number(cols[0]);
    if (!Number.isFinite(id)) continue;
    ids.push(id);
  }
  if (ids.length === 0) throw new Error("test_30_questions.csv: no question ids parsed");
  return ids;
}

/**
 * @returns {Promise<{ questionId: number, highFirst: 0 | 1, oceanScore: number }[]>}
 */
export async function loadQuestionBankRows() {
  const text = await fetchCsvText("questions.csv");
  return parseQuestionBankCsv(text);
}

/**
 * @returns {Promise<number[]>}
 */
export async function loadCanonicalTestQuestionIds() {
  const text = await fetchCsvText("test_30_questions.csv");
  return parseTest30QuestionIds(text);
}
