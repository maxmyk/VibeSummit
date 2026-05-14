import { legacyAssessmentPairUrls } from "./legacyImageIds.js";

/** @typedef {{ baseQuestionId: number, presentationId: number, reversed: boolean }} PresentationRef */

const MAX_Q = 30;
const REVERSED_OFFSET = 30;

/**
 * @param {number} presentationId 1..30 normal; 31..60 means base (id − 30) with reversed left/right images.
 * @returns {PresentationRef}
 */
export function parsePresentationId(presentationId) {
  const id = Math.round(presentationId);
  if (id > REVERSED_OFFSET && id <= REVERSED_OFFSET * 2) {
    return { baseQuestionId: id - REVERSED_OFFSET, presentationId: id, reversed: true };
  }
  return {
    baseQuestionId: Math.min(MAX_Q, Math.max(1, id)),
    presentationId: id,
    reversed: false,
  };
}

/**
 * @param {number} presentationId
 * @param {number} highFirst 0|1 from DB
 */
export function slideLayoutFromPresentation(presentationId, highFirst) {
  const { baseQuestionId, reversed } = parsePresentationId(presentationId);
  const { leftSrc: firstSrc, rightSrc: secondSrc } = legacyAssessmentPairUrls(baseQuestionId, "jpg");
  return {
    baseQuestionId,
    presentationId,
    reversed,
    highFirst: highFirst === 1,
    /** Image shown on the physical left tile */
    leftSrc: reversed ? secondSrc : firstSrc,
    /** Image shown on the physical right tile */
    rightSrc: reversed ? firstSrc : secondSrc,
  };
}

/**
 * User picked physical left (0) or right (1). Returns whether they chose the trait-high pole.
 * @param {0|1} choice
 * @param {boolean} reversed
 * @param {boolean} highFirst DB: 1 = file-order first image (`*_1.jpg`) is trait-high when not reversed
 */
export function userPickedHighPole(choice, reversed, highFirst) {
  const highOnLeft = highFirst ? !reversed : reversed;
  return highOnLeft ? choice === 0 : choice === 1;
}
