/**
 * For each DB `question_id` 1..30 (current test order), the on-disk image pair
 * still uses the original bank id: `{id}_1.jpg` / `{id}_2.jpg`.
 * Order matches `public/data/test_30_questions.csv` before renumbering.
 */
export const LEGACY_IMAGE_ID_BY_QUESTION_ID = [
  3, 17, 43, 20, 40, 14, 42, 4, 8, 37, 5, 29, 36, 35, 11, 34, 32, 9, 10, 39, 13, 12, 44, 33, 1, 2, 41, 63, 6, 53,
];

/**
 * @param {number} newQuestionId 1..30
 * @param {"jpg" | "webp" | "png"} [ext]
 */
export function legacyAssessmentPairUrls(newQuestionId, ext = "jpg") {
  const idx = Math.min(30, Math.max(1, Math.round(newQuestionId))) - 1;
  const legacyId = LEGACY_IMAGE_ID_BY_QUESTION_ID[idx];
  if (legacyId == null) {
    throw new Error(`No legacy image mapping for question_id ${newQuestionId}`);
  }
  const base = `/assessment/${legacyId}`;
  return { leftSrc: `${base}_1.${ext}`, rightSrc: `${base}_2.${ext}` };
}
