/**
 * OCEAN dyadic conversation compatibility (ported from POC Python).
 * NOT a validated psychometric instrument — heuristic only.
 * All trait inputs must be in [0, 100].
 */

/**
 * @typedef {{ openness: number, conscientiousness: number, extraversion: number, agreeableness: number, neuroticism: number }} PersonalityProfile
 */

/**
 * @typedef {{ flow: number, depth: number, comfort: number, energy: number, stability: number, overall: number }} DyadicEvaluation
 */

/**
 * @param {{ o: number, c: number, e: number, a: number, n: number }} oceanScores
 * @returns {PersonalityProfile}
 */
export function oceanScoresToProfile(oceanScores) {
  return {
    openness: oceanScores.o,
    conscientiousness: oceanScores.c,
    extraversion: oceanScores.e,
    agreeableness: oceanScores.a,
    neuroticism: oceanScores.n,
  };
}

/**
 * @param {PersonalityProfile} profile
 */
export function validatePersonalityProfile(profile) {
  const traits = [
    ["openness", profile.openness],
    ["conscientiousness", profile.conscientiousness],
    ["extraversion", profile.extraversion],
    ["agreeableness", profile.agreeableness],
    ["neuroticism", profile.neuroticism],
  ];
  for (const [traitName, value] of traits) {
    if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 100) {
      throw new Error(`${traitName} must be between 0 and 100. Got: ${value}`);
    }
  }
}

function avg(a, b) {
  return (a + b) / 2;
}

function similarity(a, b) {
  return 100 - Math.abs(a - b);
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {PersonalityProfile} personA
 * @param {PersonalityProfile} personB
 * @returns {DyadicEvaluation}
 */
export function evaluateDyadicConversation(personA, personB) {
  validatePersonalityProfile(personA);
  validatePersonalityProfile(personB);

  const O1 = personA.openness;
  const C1 = personA.conscientiousness;
  const E1 = personA.extraversion;
  const A1 = personA.agreeableness;
  const N1 = personA.neuroticism;

  const O2 = personB.openness;
  const C2 = personB.conscientiousness;
  const E2 = personB.extraversion;
  const A2 = personB.agreeableness;
  const N2 = personB.neuroticism;

  const simO = similarity(O1, O2);
  const simC = similarity(C1, C2);
  const simE = similarity(E1, E2);
  const simA = similarity(A1, A2);
  const simN = similarity(N1, N2);

  const avgO = avg(O1, O2);
  const avgC = avg(C1, C2);
  const avgE = avg(E1, E2);
  const avgA = avg(A1, A2);
  const avgN = avg(N1, N2);

  const lowN = 100 - avgN;
  const lowCRigidity = 100 - Math.max(0, avgC - 75);
  const extroBalance = 100 - Math.abs(avgE - 65);

  let flow = 0.35 * simE + 0.3 * simA + 0.2 * avgA + 0.15 * avgC;

  let depth = 0.45 * avgO + 0.25 * simO + 0.15 * avgN + 0.15 * simN;

  let comfort = 0.4 * avgA + 0.3 * simA + 0.2 * lowN + 0.1 * simC;

  let energy = 0.5 * avgE + 0.25 * avgO + 0.15 * extroBalance + 0.1 * lowCRigidity;

  let stability = 0.35 * avgC + 0.3 * avgA + 0.2 * lowN + 0.15 * simC;

  if (N1 > 75 && N2 > 75) {
    stability -= 12;
  }

  if (Math.abs(A1 - A2) > 45) {
    comfort -= 10;
  }

  if (Math.abs(E1 - E2) > 60) {
    flow -= 8;
  }

  if (O1 > 70 && O2 > 70) {
    depth += 10;
  }

  flow = clamp(flow);
  depth = clamp(depth);
  comfort = clamp(comfort);
  energy = clamp(energy);
  stability = clamp(stability);

  let overall = 0.25 * flow + 0.2 * depth + 0.25 * comfort + 0.15 * energy + 0.15 * stability;
  overall = clamp(overall);

  return {
    flow: round2(flow),
    depth: round2(depth),
    comfort: round2(comfort),
    energy: round2(energy),
    stability: round2(stability),
    overall: round2(overall),
  };
}

/**
 * @param {{ oceanScores?: { o: number, c: number, e: number, a: number, n: number } } | null | undefined} a
 * @param {{ oceanScores?: { o: number, c: number, e: number, a: number, n: number } } | null | undefined} b
 */
export function canUseDyadicMatch(a, b) {
  return Boolean(a?.oceanScores && b?.oceanScores);
}
