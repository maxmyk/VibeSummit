import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, ChevronLeft, HeartHandshake, QrCode, Search, Sparkles, UserRound, UsersRound } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { ensureQuestionsSeeded, ensureSharedAssessment, finalizeAssessment, loadSharedAssessmentSession, TOTAL_ASSESSMENT_QUESTIONS, vibeLabelFromOcean } from "./assessment/index.js";
import { canUseDyadicMatch, evaluateDyadicConversation, oceanScoresToProfile } from "./conversation/dyadicConversationModel.js";
import { getDatabase, persistAppDatabase } from "./db/index.js";
import { queryAll, queryOne } from "./assessment/sqliteUtil.js";

function Button({ children, className = "", ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Card({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

const ASSESSMENT_PROMPTS = [
  "Which image feels more like you right now?",
  "Pick the side that matches your gut instinct.",
  "If you had to choose one vibe, which is closer?",
  "Which scene would you rather step into?",
  "Which option fits your usual event energy?",
];

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map((v) => Number(v) ? 1 : 0) : [];
  } catch {
    return [];
  }
}

function normalizeOceanScores(row) {
  if (!row) return null;
  return {
    o: Math.round(Number(row.o_score ?? row.o ?? 0)),
    c: Math.round(Number(row.c_score ?? row.c ?? 0)),
    e: Math.round(Number(row.e_score ?? row.e ?? 0)),
    a: Math.round(Number(row.a_score ?? row.a ?? 0)),
    n: Math.round(Number(row.n_score ?? row.n ?? 0)),
  };
}

function profileFromDbRow(row) {
  const badgeId = String(row.badge_id || `db_user_${row.db_user_id || row.user_id}`);
  const choices = parseJsonArray(row.answers);
  const oceanScores = normalizeOceanScores(row);
  const savedName = String(row.display_name || "").trim();
  return {
    userId: badgeId,
    dbUserId: Number(row.db_user_id || row.user_id || 0),
    name: savedName || makeDisplayNameFromBadge(badgeId),
    badgeQrValue: badgeId,
    friendlyBadgeId: getFriendlyBadgeId(badgeId),
    choices,
    vibe: getVibeName(choices, oceanScores),
    oceanScores,
    createdAt: row.created_at ? new Date(Number(row.created_at)).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(Number(row.updated_at)).toISOString() : undefined,
  };
}

const API_BASE_URL = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function hasSharedBackend() {
  return Boolean(API_BASE_URL);
}

function profileFromApiRow(row) {
  const choices = Array.isArray(row?.choices) ? row.choices.map((v) => Number(v) ? 1 : 0) : [];
  const oceanScores = row?.oceanScores ? normalizeOceanScores(row.oceanScores) : null;
  const badgeId = String(row?.userId || row?.badgeQrValue || "");
  return {
    userId: badgeId,
    name: String(row?.name || "").trim() || makeDisplayNameFromBadge(badgeId),
    badgeQrValue: String(row?.badgeQrValue || badgeId),
    friendlyBadgeId: String(row?.friendlyBadgeId || getFriendlyBadgeId(row?.badgeQrValue || badgeId)),
    choices,
    vibe: String(row?.vibe || getVibeName(choices, oceanScores)),
    oceanScores,
    createdAt: row?.createdAt,
    updatedAt: row?.updatedAt,
    source: "backend",
  };
}

async function fetchJson(path, options = {}) {
  if (!API_BASE_URL) throw new Error("VITE_API_URL is not configured");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Ignore non-JSON errors.
  }

  if (!response.ok) {
    throw new Error(body?.error || `Backend request failed (${response.status})`);
  }
  return body;
}

async function saveProfileToBackend(profile) {
  if (!hasSharedBackend()) return { skipped: true };
  return fetchJson("/api/profiles", {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

async function loadProfilesFromDb() {
  if (hasSharedBackend()) {
    const data = await fetchJson("/api/profiles");
    return (data.profiles || []).map(profileFromApiRow);
  }

  const db = await getDatabase();
  const rows = queryAll(db, `
    SELECT
      u.user_id AS db_user_id,
      u.badge_id,
      u.display_name,
      u.answers,
      u.created_at,
      u.updated_at,
      v.o_score,
      v.c_score,
      v.e_score,
      v.a_score,
      v.n_score
    FROM users u
    JOIN user_vibe v ON v.user_id = u.user_id
    WHERE u.badge_id IS NOT NULL AND TRIM(u.badge_id) <> ''
    ORDER BY u.updated_at DESC, u.user_id DESC
  `);

  const latestByBadge = new Map();
  for (const row of rows) {
    const badgeId = String(row.badge_id || "");
    if (!badgeId || latestByBadge.has(badgeId)) continue;
    latestByBadge.set(badgeId, profileFromDbRow(row));
  }
  return Array.from(latestByBadge.values());
}

async function findProfileByBadgeId(badgeId) {
  if (hasSharedBackend()) {
    try {
      const data = await fetchJson(`/api/profiles/${encodeURIComponent(badgeId)}`);
      return data.profile ? profileFromApiRow(data.profile) : null;
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("not found")) return null;
      throw error;
    }
  }

  const db = await getDatabase();
  const row = queryOne(db, `
    SELECT
      u.user_id AS db_user_id,
      u.badge_id,
      u.display_name,
      u.answers,
      u.created_at,
      u.updated_at,
      v.o_score,
      v.c_score,
      v.e_score,
      v.a_score,
      v.n_score
    FROM users u
    JOIN user_vibe v ON v.user_id = u.user_id
    WHERE u.badge_id = ?
    ORDER BY u.updated_at DESC, u.user_id DESC
    LIMIT 1
  `, [badgeId]);
  return row ? profileFromDbRow(row) : null;
}

function getStoredProfile() {
  try {
    const raw = localStorage.getItem("vibecheck_profile");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredProfile(profile) {
  localStorage.setItem("vibecheck_profile", JSON.stringify(profile));
}

function makeUserIdFromBadge(scannedValue) {
  const clean = String(scannedValue || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_|_$/g, "");
  return clean || `badge_${Math.random().toString(36).slice(2, 8)}`;
}

function getFriendlyBadgeId(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "UNKNOWN";

  const pipeParts = raw.split("|").map((part) => part.trim()).filter(Boolean);
  if (pipeParts.length > 1) return pipeParts[pipeParts.length - 1];

  const underscoreParts = raw.split("_").map((part) => part.trim()).filter(Boolean);
  const lastPart = underscoreParts[underscoreParts.length - 1];
  if (underscoreParts.length > 1 && /^[a-zA-Z0-9-]{4,16}$/.test(lastPart)) return lastPart;

  return raw.slice(0, 8).toUpperCase();
}

const jokeNames = [
  "The Best Investor",
  "Fair Judge",
  "Networking Wizard",
  "Coffee-Powered Founder",
  "Badge Scanner Supreme",
  "Hallway Deal Maker",
  "Pitch Deck Prophet",
  "Wi-Fi Survivor",
  "Snack Table Strategist",
  "Panel Discussion Enjoyer",
  "The Mysterious VC",
  "Demo Day Champion",
];

function hashString(value) {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function makeDisplayNameFromBadge(rawValue) {
  const index = hashString(rawValue) % jokeNames.length;
  return jokeNames[index];
}

function getVibeName(choices, oceanScores) {
  if (oceanScores) return vibeLabelFromOcean(oceanScores);
  const ones = choices.reduce((sum, v) => sum + v, 0);
  const n = choices.length || 1;
  const ratio = ones / n;
  const firstHalf = choices.slice(0, Math.ceil(n / 2)).reduce((sum, v) => sum + v, 0);
  const secondHalf = choices.slice(Math.ceil(n / 2)).reduce((sum, v) => sum + v, 0);
  if (ratio <= 0.28) return "Focused Builder";
  if (ratio >= 0.72) return "Social Explorer";
  if (firstHalf > secondHalf) return "Vision-First Connector";
  if (secondHalf > firstHalf) return "Curious Strategist";
  return "Balanced Conversationalist";
}

function matchScore(aChoices, bChoices) {
  const len = Math.min(aChoices.length, bChoices.length);
  if (!len) return 0;
  let same = 0;
  for (let i = 0; i < len; i++) if (aChoices[i] === bChoices[i]) same += 1;
  return Math.round((same / len) * 100);
}

function getMatchText(score) {
  if (score >= 85) return "Very natural conversation fit";
  if (score >= 65) return "Good fit with a few differences";
  if (score >= 45) return "Interesting contrast";
  return "Possible friction, but maybe useful contrast";
}

/** List row / headline: dyadic overall when both have OCEAN scores, else choice overlap. */
function listMatchPercent(profile, person) {
  if (canUseDyadicMatch(profile, person)) {
    const { overall } = evaluateDyadicConversation(oceanScoresToProfile(profile.oceanScores), oceanScoresToProfile(person.oceanScores));
    return Math.round(overall);
  }
  return matchScore(profile.choices, person.choices);
}

function traitName(key) {
  return {
    o: "openness",
    c: "planning style",
    e: "social energy",
    a: "collaboration warmth",
    n: "intensity / stress style",
  }[key];
}

function highTraitPhrase(key) {
  return {
    o: "likes novelty, ideas, and unusual conversations",
    c: "prefers structure, follow-through, and clear plans",
    e: "gets energy from active social interaction",
    a: "tends to keep conversations warm and cooperative",
    n: "may bring more urgency, sensitivity, or intensity into the room",
  }[key];
}

function lowTraitPhrase(key) {
  return {
    o: "may prefer practical, concrete conversations over abstract exploration",
    c: "may prefer flexibility over rigid plans",
    e: "may prefer slower, quieter, one-on-one conversations",
    a: "may communicate more directly or challenge ideas faster",
    n: "may keep a calmer, steadier emotional pace",
  }[key];
}

function strongestTrait(scores) {
  return ["o", "c", "e", "a", "n"].sort((a, b) => scores[b] - scores[a])[0];
}

function largestTraitGap(a, b) {
  return ["o", "c", "e", "a", "n"]
    .map((key) => ({ key, gap: Math.abs(a[key] - b[key]), mine: a[key], theirs: b[key] }))
    .sort((x, y) => y.gap - x.gap)[0];
}

function getDyadicNarrative(profile, person, dyadic) {
  if (!profile?.oceanScores || !person?.oceanScores || !dyadic) {
    return {
      strengths: ["You have enough profile data to compare basic choice overlap."],
      frictions: ["Ask one concrete opener first, then let the conversation reveal the real fit."],
    };
  }

  const strengths = [];
  const frictions = [];
  const mine = profile.oceanScores;
  const theirs = person.oceanScores;
  const gap = largestTraitGap(mine, theirs);
  const myStrong = strongestTrait(mine);
  const theirStrong = strongestTrait(theirs);

  if (dyadic.comfort >= 70) strengths.push("The conversation should feel fairly easy: the model sees good comfort and cooperation potential.");
  if (dyadic.flow >= 70) strengths.push("Your social pacing should be reasonably aligned, so starting and sustaining a conversation may feel natural.");
  if (dyadic.depth >= 70) strengths.push("There is strong potential for a deeper conversation rather than only small talk.");
  if (dyadic.energy >= 70) strengths.push("This match may feel lively and energizing in a busy event environment.");
  if (dyadic.stability >= 70) strengths.push("The interaction looks steady enough for practical follow-up after the event.");

  if (strengths.length === 0) {
    strengths.push(`Your strongest signal is ${traitName(myStrong)}: you ${highTraitPhrase(myStrong)}.`);
    if (theirStrong !== myStrong) strengths.push(`Their strongest signal is ${traitName(theirStrong)}: they ${highTraitPhrase(theirStrong)}.`);
  }

  if (gap.gap >= 40) {
    const minePhrase = gap.mine >= gap.theirs ? highTraitPhrase(gap.key) : lowTraitPhrase(gap.key);
    const theirPhrase = gap.theirs >= gap.mine ? highTraitPhrase(gap.key) : lowTraitPhrase(gap.key);
    frictions.push(`Biggest contrast: ${traitName(gap.key)}. You ${minePhrase}; they ${theirPhrase}.`);
  }
  if (dyadic.flow < 55) frictions.push("Pacing may differ: one person may want more speed, energy, or spontaneity than the other.");
  if (dyadic.comfort < 55) frictions.push("Comfort may need a softer opener. Start with a low-pressure question rather than a direct pitch.");
  if (dyadic.energy < 55) frictions.push("Energy may be uneven, so a short focused conversation may work better than a long open-ended one.");

  if (frictions.length === 0) frictions.push("No major friction signal stands out. Still, keep the first question simple and human.");

  return { strengths: strengths.slice(0, 2), frictions: frictions.slice(0, 2) };
}

function getFallbackMatchDetails(myChoices, theirChoices) {
  const len = Math.min(myChoices?.length || 0, theirChoices?.length || 0);
  if (!len) {
    return {
      similarities: ["No shared assessment data is available yet."],
      differences: ["Ask them what kind of conversations they are hoping to have today."],
    };
  }
  let same = 0;
  for (let i = 0; i < len; i++) if (myChoices[i] === theirChoices[i]) same++;
  const pct = Math.round((same / len) * 100);
  return {
    similarities: pct >= 50 ? [`You chose the same side on ${same} of ${len} image prompts.`] : [],
    differences: pct < 50 ? [`You chose different sides on ${len - same} of ${len} image prompts.`] : [],
  };
}

function makeSuggestedOpener(person, dyadic) {
  if (!dyadic) return "What kind of conversations are you hoping to have here today?";
  if (dyadic.depth >= 70) return "What idea from this event has actually made you think?";
  if (dyadic.energy >= 70) return "What’s been the most exciting thing you’ve seen here so far?";
  if (dyadic.stability >= 70) return "What would make this event genuinely useful for you?";
  if (dyadic.comfort < 55) return "What brought you to this event today?";
  return `What kind of people are you hoping to meet today, ${person.name}?`;
}

function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto min-h-screen max-w-5xl bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-5 shadow-2xl sm:px-6 lg:px-8">
        <div className="min-h-[calc(100vh-132px)]">{children}</div>
        <CreditsFooter />
      </div>
    </div>
  );
}

function CreditsFooter() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <footer className="mt-8 text-xs leading-5 text-slate-400">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="mx-auto flex items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 font-bold uppercase tracking-[0.18em] text-slate-300 backdrop-blur transition hover:bg-white/10 active:scale-95"
      >
        Credits {isOpen ? "−" : "+"}
      </button>

      {isOpen && (
        <div className="mt-3 rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-4 backdrop-blur sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-black uppercase tracking-[0.18em] text-slate-300">Credits</p>
              <p className="mt-2">
                Built by{" "}
                <a className="text-indigo-200 underline decoration-indigo-300/50 underline-offset-4" href="https://github.com/ashulikov" target="_blank" rel="noreferrer">
                  Arsenii Shulikov
                </a>{" "}
                &{" "}
                <a className="text-indigo-200 underline decoration-indigo-300/50 underline-offset-4" href="https://github.com/maxmyk" target="_blank" rel="noreferrer">
                  Maksym Mykhasyuta
                </a>{" "}
                for the Web Summit Vancouver hackathon. AI pair-programming support by ChatGPT.
              </p>
            </div>
            <div className="grid gap-2 sm:max-w-md sm:text-right">
              <p>
                <span className="font-bold text-slate-300">Tech:</span> React, Vite, Tailwind CSS, Framer Motion, Lucide React, html5-qrcode, LocalStorage.
              </p>
              <p>
                <span className="font-bold text-slate-300">Images:</span> demo stock photos loaded from Unsplash image CDN.
              </p>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}

function TopBar({ title, subtitle, onBack }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      {onBack && (
        <button onClick={onBack} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white active:scale-95">
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      <div>
        <h1 className="text-2xl font-black leading-tight tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-300">{subtitle}</p>}
      </div>
    </div>
  );
}

function BigActionButton({ icon: Icon, title, description, onClick, primary = false }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-[1.5rem] border p-4 text-left shadow-lg active:scale-[0.99] ${
        primary ? "border-indigo-400/30 bg-indigo-500 text-white shadow-indigo-950/40" : "border-white/10 bg-white/10 text-white shadow-black/20"
      }`}
    >
      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${primary ? "bg-white/20" : "bg-white/10"}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="font-black">{title}</p>
        <p className={`text-sm ${primary ? "text-indigo-100" : "text-slate-300"}`}>{description}</p>
      </div>
    </button>
  );
}

function HomeScreen({ profile, onStartTest, onScan, onFind, onProfile }) {
  return (
    <AppShell>
      <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-md flex-col justify-between lg:max-w-3xl">
        <div>
          <div className="mb-8 rounded-[2rem] border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur sm:p-7">
            <div className="mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/30">
              <HeartHandshake className="h-8 w-8" />
            </div>
            <h1 className="text-5xl font-black tracking-tight sm:text-6xl">VibeSummit</h1>
            <p className="mt-4 text-lg leading-7 text-slate-200">Meet people you’ll actually enjoy talking to at live events.</p>
            <p className="mt-3 text-sm leading-6 text-slate-400">Match by conversation style, energy, and event goals — not just title or company.</p>
          </div>

          {profile && (
            <Card className="mb-4 rounded-[1.75rem] border border-white/10 bg-white/10 text-white">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400/20 text-emerald-300"><UserRound className="h-6 w-6" /></div>
                <div className="min-w-0"><p className="truncate font-black">{profile.name}</p><p className="truncate text-sm text-slate-300">{profile.vibe} · {profile.friendlyBadgeId || getFriendlyBadgeId(profile.badgeQrValue || profile.userId)}</p></div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            <BigActionButton icon={Camera} title="Scan attendee QR" description="Check match from a badge" onClick={onScan} />
            <BigActionButton icon={Search} title="Find people" description="Search shared profiles" onClick={onFind} />
            <BigActionButton icon={Sparkles} title={profile ? "Rescan badge & retake test" : "Scan badge & start test"} description="Use your event badge ID first" onClick={onStartTest} primary />
            {profile && <BigActionButton icon={QrCode} title="Show my profile" description="View your badge ID and choices" onClick={onProfile} />}
          </div>
        </div>
        <p className="mt-8 text-center text-xs leading-5 text-slate-500">Friendly demo only. Not a real personality diagnosis.</p>
      </div>
    </AppShell>
  );
}

function QrScanner({ title, subtitle, onDetected, onBack }) {
  const scannerId = "vibecheck-qr-reader";
  const scannerRef = useRef(null);
  const hasDetectedRef = useRef(false);
  const [manualId, setManualId] = useState("");
  const [status, setStatus] = useState("Starting camera…");
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function stopScanner() {
      try {
        if (scannerRef.current?.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current?.clear();
      } catch {
        // Ignore cleanup errors. They can happen if the camera was never started.
      }
    }

    async function startScanner() {
      try {
        const scanner = new Html5Qrcode(scannerId, false);
        scannerRef.current = scanner;

        const cameras = await Html5Qrcode.getCameras();
        if (!mounted) return;

        if (!cameras || cameras.length === 0) {
          setStatus("No camera found. Use the manual fallback for the demo.");
          return;
        }

        const backCamera = cameras.find((camera) =>
          /back|rear|environment/i.test(camera.label)
        );
        const cameraId = backCamera?.id || cameras[0].id;

        await scanner.start(
          cameraId,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          async (decodedText) => {
            if (hasDetectedRef.current) return;
            hasDetectedRef.current = true;
            setStatus("QR detected.");
            await stopScanner();
            onDetected(decodedText);
          },
          () => {
            // Scan failures happen every frame when no QR is visible; no need to show them.
          }
        );

        if (!mounted) {
          await stopScanner();
          return;
        }

        setIsScanning(true);
        setStatus("Looking for QR code…");
      } catch {
        setStatus("Camera scanner could not start. Check camera permission or use manual fallback.");
      }
    }

    startScanner();

    return () => {
      mounted = false;
      stopScanner();
    };
  }, [onDetected]);

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <TopBar title={title} subtitle={subtitle} onBack={onBack} />
        <Card className="rounded-[2rem] border border-white/10 bg-white/10 text-white">
          <CardContent className="space-y-5 p-5">
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950">
              <div id={scannerId} className="min-h-72 w-full overflow-hidden rounded-[1.5rem] [&_video]:!h-72 [&_video]:!w-full [&_video]:!object-cover" />
              {!isScanning && (
                <div className="absolute inset-0 grid place-items-center bg-slate-950">
                  <div className="text-center">
                    <Camera className="mx-auto h-10 w-10 text-slate-400" />
                    <p className="mt-3 font-black">Camera scanner</p>
                    <p className="mt-1 px-6 text-sm leading-6 text-slate-400">{status}</p>
                  </div>
                </div>
              )}
              <div className="pointer-events-none absolute inset-8 rounded-3xl border-4 border-white/70" />
            </div>

            <div className="rounded-2xl bg-slate-950 p-4 text-sm leading-6 text-slate-300">{status}</div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="mb-2 text-sm font-bold text-slate-300">Fallback for demo/testing</p>
              <div className="flex gap-2">
                <input
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 font-mono text-white outline-none focus:border-indigo-400"
                  placeholder="Paste badge QR value"
                />
                <Button
                  onClick={() => manualId.trim() && onDetected(manualId)}
                  disabled={!manualId.trim()}
                  className="rounded-2xl bg-indigo-500 px-5 font-black text-white hover:bg-indigo-600"
                >
                  Use
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function AssessmentImage({ src, alt, className }) {
  const [step, setStep] = useState(0);
  const url = useMemo(() => {
    if (step === 0) return src;
    if (step === 1) {
      if (/\.webp$/i.test(src)) return src.replace(/\.webp$/i, ".png");
      if (/\.jpg$/i.test(src)) return src.replace(/\.jpg$/i, ".png");
      if (/\.jpeg$/i.test(src)) return src.replace(/\.jpeg$/i, ".png");
      return src;
    }
    return `https://placehold.co/800x520/1e293b/ffffff?text=${encodeURIComponent(alt.slice(0, 20))}`;
  }, [src, alt, step]);

  return <img src={url} alt={alt} className={className} onError={() => setStep((s) => Math.min(s + 1, 2))} />;
}

function TestScreen({ scannedBadgeValue, onDone, onBack, onNeedScan }) {
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState([]);
  const [started, setStarted] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const total = session?.slides?.length ?? TOTAL_ASSESSMENT_QUESTIONS;
  const progress = Math.round((choices.length / total) * 100);
  const slide = session?.slides?.[index];

  async function handleBegin() {
    setLoading(true);
    setError(null);
    try {
      const db = await getDatabase();
      await ensureQuestionsSeeded(db);
      persistAppDatabase(db);
      const nextSession = await loadSharedAssessmentSession(db);
      setSession(nextSession);
      setStarted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function finishWithChoices(next) {
    if (!session) return;
    const db = await getDatabase();
    const badgeId = makeUserIdFromBadge(scannedBadgeValue);
    const cleanDisplayName = displayName.trim();
    const { dbUserId, oceanScores } = finalizeAssessment(db, {
      badgeId,
      displayName: cleanDisplayName,
      assessmentId: session.assessmentId,
      choices: next,
      scoringSlides: session.scoringSlides,
    });
    const userId = badgeId;
    const profile = {
      userId,
      name: cleanDisplayName || makeDisplayNameFromBadge(scannedBadgeValue),
      badgeQrValue: scannedBadgeValue,
      friendlyBadgeId: getFriendlyBadgeId(scannedBadgeValue),
      choices: next,
      vibe: getVibeName(next, oceanScores),
      oceanScores,
      assessmentId: session.assessmentId,
      dbUserId,
      presentationIds: session.presentationIds,
      createdAt: new Date().toISOString(),
    };
    saveStoredProfile(profile);
    try {
      await saveProfileToBackend(profile);
    } catch (error) {
      console.warn("Backend profile save failed", error);
    }
    onDone(profile);
  }

  function choose(value) {
    const next = [...choices, value];
    if (!session) return;
    if (next.length >= session.slides.length) {
      void finishWithChoices(next);
      return;
    }
    setChoices(next);
    setIndex(index + 1);
  }

  if (!scannedBadgeValue) {
    return (
      <AppShell><div className="mx-auto max-w-md"><TopBar title="Badge required" subtitle="Scan your event badge before starting" onBack={onBack} /><Card className="rounded-[2rem] border border-white/10 bg-white/10 text-white"><CardContent className="space-y-5 p-5"><div className="grid h-16 w-16 place-items-center rounded-3xl bg-indigo-500"><QrCode className="h-8 w-8" /></div><h2 className="text-3xl font-black tracking-tight">Start with your badge QR</h2><p className="leading-7 text-slate-300">Your badge QR links this test to your event profile. Your choices stay hidden from the public profile view.</p><Button onClick={onNeedScan} className="w-full rounded-2xl bg-indigo-500 py-6 text-base font-black text-white hover:bg-indigo-600">Scan badge</Button></CardContent></Card></div></AppShell>
    );
  }

  if (!started) {
    const userId = makeUserIdFromBadge(scannedBadgeValue);
    return (
      <AppShell>
        <div className="mx-auto max-w-md">
          <TopBar title="Vibe test" subtitle="Thirty quick image choices — six per OCEAN facet (scores 0–100 in steps of 20)" onBack={onBack} />
          <Card className="rounded-[2rem] border border-white/10 bg-white/10 text-white">
            <CardContent className="space-y-5 p-5">
              <div className="grid h-16 w-16 place-items-center rounded-3xl bg-indigo-500">
                <Sparkles className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-3xl font-black tracking-tight">Badge linked</h2>
                <p className="mt-3 leading-7 text-slate-300">
                  Everyone takes the same short visual test. Your badge token links the result to your event profile, while the internal score details stay hidden from the public profile view.
                </p>
              </div>
              <DataBox label="badge token" value={getFriendlyBadgeId(scannedBadgeValue)} />
              <label className="block text-left">
                <span className="mb-2 block text-sm font-bold text-slate-300">Your name <span className="font-normal text-slate-500">(optional)</span></span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-indigo-400"
                  placeholder="e.g. Max"
                  maxLength={40}
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">This is only used so other testers can find you by name. You can leave it blank and use a fun generated name.</p>
              </label>
              {error && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div>}
              <Button onClick={() => void handleBegin()} disabled={loading} className="w-full rounded-2xl bg-indigo-500 py-6 text-base font-black text-white hover:bg-indigo-600 disabled:opacity-60">
                {loading ? "Preparing…" : "Begin"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  if (!slide) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md text-center text-slate-300">
          <TopBar title="Loading" subtitle="Starting assessment" onBack={onBack} />
        </div>
      </AppShell>
    );
  }

  const prompt = ASSESSMENT_PROMPTS[index % ASSESSMENT_PROMPTS.length];

  return (
    <AppShell>
      <TopBar title="Choose your vibe" subtitle={`Question ${index + 1} of ${total}`} onBack={onBack} />
      <div className="mb-5 h-3 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-indigo-400" animate={{ width: `${progress}%` }} /></div>
      <AnimatePresence mode="wait">
        <motion.div key={slide.presentationId} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
          <h2 className="mx-auto mb-5 max-w-3xl text-2xl font-black leading-tight tracking-tight sm:text-3xl">{prompt}</h2>
          <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
            <ChoiceCard label="Left image" image={slide.leftSrc} onChoose={() => choose(0)} />
            <ChoiceCard label="Right image" image={slide.rightSrc} onChoose={() => choose(1)} />
          </div>
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}

function ChoiceCard({ label, image, onChoose }) {
  return (
    <button onClick={onChoose} className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/10 text-left shadow-xl active:scale-[0.99]">
      <AssessmentImage src={image} alt={label} className="h-44 w-full object-cover sm:h-56 lg:h-72" />
      <div className="flex items-center justify-between gap-3 p-4"><p className="text-lg font-black text-white sm:text-xl">{label}</p><div className="rounded-full bg-white px-3 py-1 text-sm font-black text-slate-950">Pick</div></div>
    </button>
  );
}

function ProfileScreen({ profile, onBack, onFind }) {
  if (!profile) return <AppShell><TopBar title="No profile yet" onBack={onBack} /></AppShell>;
  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <TopBar title="Your VibeSummit" subtitle="Share this badge ID" onBack={onBack} />
        <Card className="rounded-[2rem] border border-white/10 bg-white/10 text-white">
          <CardContent className="space-y-5 p-5 text-center">
            <div className="mx-auto grid h-36 w-36 place-items-center rounded-3xl border-4 border-slate-950 bg-white text-slate-950 shadow-xl">
              <div className="grid grid-cols-6 gap-1">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} className={`h-3 w-3 ${((i * 7 + profile.userId.length) % 3) ? "bg-slate-950" : "bg-white"}`} />
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-3xl font-black">{profile.name}</h2>
              <p className="mt-1 text-indigo-200">{profile.vibe}</p>
            </div>
            <DataBox label="badge token" value={profile.friendlyBadgeId || getFriendlyBadgeId(profile.badgeQrValue || profile.userId)} />
            <Button onClick={onFind} className="w-full rounded-2xl bg-indigo-500 py-6 font-black text-white hover:bg-indigo-600">
              Find a match
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function DataBox({ label, value }) {
  return <div className="rounded-2xl bg-slate-950 p-4 text-left"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-1 break-all font-mono text-sm text-white">{value}</p></div>;
}

function NeedProfileNotice() {
  return <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">Take the vibe test first so the app has your choice array for matching.</div>;
}

function FindByNameScreen({ profile, onBack, onMatch }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function refreshPeople() {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadProfilesFromDb();
      setPeople(loaded.filter((p) => p.userId !== profile?.userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshPeople();
  }, [profile?.userId]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => `${p.name} ${p.vibe} ${p.friendlyBadgeId} ${p.userId}`.toLowerCase().includes(q));
  }, [query, people]);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md lg:max-w-3xl">
        <TopBar title="Find a saved profile" subtitle="Search people who completed the test" onBack={onBack} />
        {!profile && <NeedProfileNotice />}

        <div className="mb-4 flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-500"
            placeholder="Search badge token or vibe..."
          />
        </div>

        <div className="mb-4 rounded-2xl bg-white/5 p-4 text-sm leading-6 text-slate-300">
          {hasSharedBackend()
            ? "Profiles are loaded from the shared backend, so other phones can appear here after completing the test."
            : "Profiles are only stored on this device because VITE_API_URL is not configured. Deploy/connect the backend for multi-device matching."}
        </div>

        {loading && <div className="rounded-2xl bg-white/10 p-4 text-slate-300">Loading saved profiles…</div>}
        {error && <div className="rounded-2xl bg-rose-500/10 p-4 text-rose-200">{error}</div>}
        {!loading && !error && results.length === 0 && (
          <div className="rounded-2xl bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
            No other saved profiles found yet. Ask another attendee to scan their badge and complete the test, then refresh this screen.
          </div>
        )}

        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {results.map((person) => (
            <PersonRow key={`${person.userId}-${person.dbUserId || "latest"}`} person={person} profile={profile} onClick={() => profile && onMatch(person)} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function PersonRow({ person, profile, onClick }) {
  const score = profile ? listMatchPercent(profile, person) : null;

  return (
    <button
      onClick={onClick}
      disabled={!profile}
      className="flex w-full min-w-0 items-center gap-3 rounded-[1.5rem] border border-white/10 bg-white/10 p-3 text-left shadow-lg disabled:opacity-60 active:scale-[0.99] sm:p-4"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-400/20 text-indigo-200 sm:h-12 sm:w-12">
        <UsersRound className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-sm font-black text-white sm:text-base">{person.name}</p>
        <p className="truncate text-xs text-slate-300 sm:text-sm">{person.vibe}</p>
        <p className="truncate font-mono text-xs text-slate-500">{person.friendlyBadgeId || getFriendlyBadgeId(person.userId)}</p>
      </div>

      {score !== null && (
        <div className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-950 sm:px-3 sm:text-sm">
          {score}%
        </div>
      )}
    </button>
  );
}

function ScanScreen({ profile, onBack, onMatch }) {
  const [scannedValue, setScannedValue] = useState(null);
  const [found, setFound] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scannedId = scannedValue ? makeUserIdFromBadge(scannedValue) : "";

  useEffect(() => {
    let cancelled = false;
    if (!scannedValue) return;
    setLoading(true);
    setError(null);
    setFound(null);
    (async () => {
      try {
        const person = await findProfileByBadgeId(scannedId);
        if (!cancelled) setFound(person);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scannedValue, scannedId]);

  if (!scannedValue) return <QrScanner title="Scan attendee QR" subtitle="Scan someone’s badge to check match" onBack={onBack} onDetected={setScannedValue} />;

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <TopBar title="QR detected" subtitle="Checking saved profiles" onBack={() => setScannedValue(null)} />
        {!profile && <NeedProfileNotice />}
        <Card className="rounded-[2rem] border border-white/10 bg-white/10 text-white">
          <CardContent className="space-y-5 p-5">
            <DataBox label="badge token" value={getFriendlyBadgeId(scannedValue)} />

            {loading && <div className="rounded-2xl bg-slate-950 p-4 text-slate-300">Looking up this badge in the shared profiles…</div>}
            {error && <div className="rounded-2xl bg-rose-500/10 p-4 text-rose-200">{error}</div>}
            {!loading && !error && found && (
              <div className="rounded-2xl bg-slate-950 p-4">
                <p className="font-black">{found.name}</p>
                <p className="text-sm text-indigo-200">{found.vibe}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">{found.friendlyBadgeId}</p>
              </div>
            )}
            {!loading && !error && !found && (
              <div className="rounded-2xl bg-rose-500/10 p-4 text-sm leading-6 text-rose-200">
                This badge was scanned, but no completed test exists for it yet. Ask them to complete the test first.
              </div>
            )}

            <Button onClick={() => found && profile && onMatch(found)} disabled={!found || !profile} className="w-full rounded-2xl bg-indigo-500 py-6 font-black text-white hover:bg-indigo-600 disabled:opacity-50">Show match</Button>
            <Button onClick={() => setScannedValue(null)} className="w-full rounded-2xl bg-white/10 py-6 font-black text-white hover:bg-white/20">Scan again</Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

const DYADIC_DIMENSIONS = [
  ["flow", "Flow", "Pacing & coordination"],
  ["depth", "Depth", "Intellectual / emotional richness"],
  ["comfort", "Comfort", "Safety & ease"],
  ["energy", "Energy", "Stimulation & activation"],
  ["stability", "Stability", "Sustainability over time"],
];

function MatchScreen({ profile, person, onBack }) {
  const useDyadic = canUseDyadicMatch(profile, person);
  const dyadic = useDyadic
    ? evaluateDyadicConversation(oceanScoresToProfile(profile.oceanScores), oceanScoresToProfile(person.oceanScores))
    : null;
  const choiceOverlap = matchScore(profile.choices, person.choices);
  const headlineScore = useDyadic ? Math.round(dyadic.overall) : choiceOverlap;
  const fallbackDetails = getFallbackMatchDetails(profile.choices, person.choices);
  const narrative = useDyadic ? getDyadicNarrative(profile, person, dyadic) : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-md lg:max-w-3xl">
        <TopBar title="Your match" subtitle={`${profile.name} + ${person.name}`} onBack={onBack} />
        <Card className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 text-white">
          <CardContent>
            <div className="bg-gradient-to-br from-indigo-500 to-fuchsia-500 p-6 text-center">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/70">{useDyadic ? "Conversation fit (OCEAN dyadic)" : "Image choice overlap"}</p>
              <div className="mt-3 text-7xl font-black">{headlineScore}%</div>
              <p className="mt-2 text-lg font-bold">{getMatchText(headlineScore)}</p>
              {useDyadic && <p className="mt-2 text-xs leading-5 text-white/80">Heuristic model: similarity, dyadic averages, and nonlinear adjustments — not a validated instrument.</p>}
            </div>
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-3">
                <MiniProfile title="You" name={profile.name} vibe={profile.vibe} oceanScores={profile.oceanScores} />
                <MiniProfile title="Them" name={person.name} vibe={person.vibe} oceanScores={person.oceanScores} />
              </div>

              {useDyadic && dyadic && (
                <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Dyadic dimensions</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DYADIC_DIMENSIONS.map(([key, label, hint]) => (
                      <div key={key} className="rounded-xl bg-white/5 px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-black text-white">{label}</span>
                          <span className="font-mono text-sm font-bold text-indigo-200">{dyadic[key]}%</span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-center font-mono text-sm text-slate-300">
                    Overall (weighted): <span className="font-black text-white">{dyadic.overall}%</span>
                  </p>
                </div>
              )}

              {useDyadic && (
                <div className="rounded-2xl bg-white/5 px-4 py-3 text-center text-sm text-slate-300">
                  Image choice overlap (same side picks): <span className="font-black text-white">{choiceOverlap}%</span>
                </div>
              )}

              <InfoBlock
                title="Why you may click"
                items={useDyadic ? narrative.strengths : (fallbackDetails.similarities.length ? fallbackDetails.similarities : ["The profiles are different, so start with a neutral, low-pressure opener."])}
                tone="green"
              />
              <InfoBlock
                title={useDyadic ? "Possible friction" : "Conversation contrast"}
                items={useDyadic ? narrative.frictions : (fallbackDetails.differences.length ? fallbackDetails.differences : ["Very few obvious friction points from this simplified test."])}
                tone="orange"
              />

              <div className="rounded-2xl bg-slate-950 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Suggested opener</p>
                <p className="mt-2 text-lg font-black leading-7">“{makeSuggestedOpener(person, dyadic)}”</p>
              </div>

              <div className="rounded-2xl bg-white/5 p-4 text-xs leading-5 text-slate-400">
                {useDyadic
                  ? "When both people have OCEAN scores from the image test, the headline match uses the dyadic conversation model. Otherwise only choice overlap is shown."
                  : "Complete the image assessment on both sides to unlock the OCEAN dyadic conversation scores. For now the headline uses image choice overlap only."}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function MiniProfile({ title, name, vibe, oceanScores }) {
  return (
    <div className="rounded-2xl bg-slate-950 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <p className="mt-1 truncate font-black">{name}</p>
      <p className="mt-1 text-sm text-indigo-200">{vibe}</p>
      {oceanScores && (
        <p className="mt-2 text-xs leading-relaxed text-slate-400">Profile completed</p>
      )}
    </div>
  );
}

function InfoBlock({ title, items, tone }) {
  const style = tone === "green" ? "bg-emerald-400/10 text-emerald-100" : "bg-amber-400/10 text-amber-100";
  return <div className={`rounded-2xl p-4 ${style}`}><p className="mb-2 font-black">{title}</p><ul className="space-y-2 text-sm leading-6">{items.map((item, idx) => <li key={idx}>• {item}</li>)}</ul></div>;
}

export default function App() {
  const [screen, setScreen] = useState("home");
  const [profile, setProfile] = useState(() => getStoredProfile());
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [scannedBadgeValue, setScannedBadgeValue] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDatabase();
        if (cancelled) return;
        await ensureQuestionsSeeded(db);
        await ensureSharedAssessment(db);
        persistAppDatabase(db);
      } catch (err) {
        console.warn("DB bootstrap failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function goHome() {
    setScreen("home");
    setSelectedPerson(null);
  }

  function handleProfileDone(nextProfile) {
    setProfile(nextProfile);
    setScreen("profile");
  }

  function showMatch(person) {
    setSelectedPerson(person);
    setScreen("match");
  }

  if (screen === "badge-scan") {
    return <QrScanner title="Scan your badge" subtitle="Your badge QR becomes your VibeSummit ID" onBack={goHome} onDetected={(value) => { setScannedBadgeValue(value); setScreen("test"); }} />;
  }

  if (screen === "test") {
    return <TestScreen scannedBadgeValue={scannedBadgeValue} onDone={handleProfileDone} onBack={goHome} onNeedScan={() => setScreen("badge-scan")} />;
  }

  if (screen === "profile") {
    return <ProfileScreen profile={profile} onBack={goHome} onFind={() => setScreen("find")} />;
  }

  if (screen === "find") {
    return <FindByNameScreen profile={profile} onBack={goHome} onMatch={showMatch} />;
  }

  if (screen === "scan") {
    return <ScanScreen profile={profile} onBack={goHome} onMatch={showMatch} />;
  }

  if (screen === "match" && profile && selectedPerson) {
    return <MatchScreen profile={profile} person={selectedPerson} onBack={() => setScreen("find")} />;
  }

  return <HomeScreen profile={profile} onStartTest={() => setScreen("badge-scan")} onScan={() => setScreen("scan")} onFind={() => setScreen("find")} onProfile={() => setScreen("profile")} />;
}
