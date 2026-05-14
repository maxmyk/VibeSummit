import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, ChevronLeft, HeartHandshake, QrCode, Search, Sparkles, UserRound, UsersRound } from "lucide-react";
import { ensureQuestionsSeeded, ensureSharedAssessment, finalizeAssessment, loadSharedAssessmentSession, TOTAL_ASSESSMENT_QUESTIONS, vibeLabelFromOcean } from "./assessment/index.js";
import { canUseDyadicMatch, evaluateDyadicConversation, oceanScoresToProfile } from "./conversation/dyadicConversationModel.js";
import { getDatabase, persistAppDatabase } from "./db/index.js";

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

function padChoicesToLength(arr, len = TOTAL_ASSESSMENT_QUESTIONS) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(arr[i % arr.length]);
  return out;
}

const samplePeople = [
  { userId: "u_maya_24", name: "Maya Chen", role: "Product Designer", company: "Early-stage startup", choices: padChoicesToLength([1, 1, 1, 1, 1, 1, 1, 1]), oceanScores: { o: 80, c: 45, e: 85, a: 78, n: 42 }, vibe: "Creative Connector", opener: "What’s one product experience here that actually impressed you?" },
  { userId: "u_andre_18", name: "Andre Wilson", role: "Backend Developer", company: "Cloud tools company", choices: padChoicesToLength([0, 0, 0, 0, 0, 0, 0, 0]), oceanScores: { o: 42, c: 82, e: 28, a: 58, n: 35 }, vibe: "Practical Builder", opener: "What’s a technical problem you’ve seen solved well recently?" },
  { userId: "u_sofia_31", name: "Sofia Martinez", role: "Data Analyst", company: "Climate analytics startup", choices: padChoicesToLength([0, 1, 0, 1, 0, 1, 0, 1]), oceanScores: { o: 62, c: 58, e: 52, a: 64, n: 48 }, vibe: "Curious Analyst", opener: "What data or trend here surprised you today?" },
  { userId: "u_noah_45", name: "Noah Kim", role: "Founder", company: "AI meeting assistant", choices: padChoicesToLength([1, 1, 0, 1, 1, 1, 0, 1]), oceanScores: { o: 72, c: 52, e: 82, a: 66, n: 55 }, vibe: "Energetic Explorer", opener: "What are you building, and what made you start?" },
  { userId: "u_ella_77", name: "Ella Thompson", role: "UX Researcher", company: "Design lab", choices: padChoicesToLength([0, 1, 1, 1, 1, 0, 1, 1]), oceanScores: { o: 76, c: 50, e: 54, a: 84, n: 46 }, vibe: "Empathetic Strategist", opener: "What kind of conversations are you hoping to have here?" },
];

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

function makeDisplayNameFromBadge(userId) {
  return `Attendee ${userId.slice(-6).toUpperCase()}`;
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

function getMatchDetails(myChoices, theirChoices) {
  const labels = [
    ["deep conversations", "many quick introductions"],
    ["quiet workshops", "busy mixers"],
    ["technical demos", "vision talks"],
    ["clear conversation topics", "open-ended curiosity"],
    ["building useful things", "exploring new things"],
    ["planned schedules", "spontaneous flow"],
    ["practical problem-solving", "creative brainstorming"],
    ["how things work", "how things feel"],
  ];
  const max = Math.min(myChoices.length, theirChoices.length);
  while (labels.length < max) {
    const n = labels.length + 1;
    labels.push([`image set A (item ${n})`, `image set B (item ${n})`]);
  }
  const similarities = [];
  const differences = [];
  for (let i = 0; i < max; i++) {
    if (myChoices[i] === theirChoices[i]) similarities.push(`You both picked the same side on item ${i + 1}.`);
    else differences.push(`On item ${i + 1}, you picked ${labels[i][myChoices[i]]}, while they leaned toward ${labels[i][theirChoices[i]]}.`);
  }
  return { similarities: similarities.slice(0, 2), differences: differences.slice(0, 2) };
}

function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto min-h-screen max-w-5xl bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-5 shadow-2xl sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
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
            <h1 className="text-5xl font-black tracking-tight sm:text-6xl">VibeCheck</h1>
            <p className="mt-4 text-lg leading-7 text-slate-200">Meet people you’ll actually enjoy talking to at live events.</p>
            <p className="mt-3 text-sm leading-6 text-slate-400">Match by conversation style, energy, and event goals — not just title or company.</p>
          </div>

          {profile && (
            <Card className="mb-4 rounded-[1.75rem] border border-white/10 bg-white/10 text-white">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400/20 text-emerald-300"><UserRound className="h-6 w-6" /></div>
                <div className="min-w-0"><p className="truncate font-black">{profile.name}</p><p className="truncate text-sm text-slate-300">{profile.vibe} · {profile.userId}</p></div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            <BigActionButton icon={Camera} title="Scan attendee QR" description="Check match from a badge" onClick={onScan} />
            <BigActionButton icon={Search} title="Find by name" description="Search sample attendees" onClick={onFind} />
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
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const [manualId, setManualId] = useState("");
  const [status, setStatus] = useState("Starting camera…");
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    let stopped = false;

    async function scanLoop() {
      if (!videoRef.current || !detectorRef.current || stopped) return;
      try {
        const codes = await detectorRef.current.detect(videoRef.current);
        if (codes.length > 0) {
          stopCamera();
          onDetected(codes[0].rawValue);
          return;
        }
      } catch {
        /* ignore transient frame decode errors */
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    }

    function stopCamera() {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    }

    async function startCamera() {
      if (!("BarcodeDetector" in window)) {
        setStatus("This browser does not support built-in QR scanning. Use the manual fallback for the demo.");
        return;
      }
      try {
        detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
        setStatus("Looking for QR code…");
        scanLoop();
      } catch {
        setStatus("Camera unavailable. Use the manual fallback for the demo.");
      }
    }

    startCamera();
    return stopCamera;
  }, [onDetected]);

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <TopBar title={title} subtitle={subtitle} onBack={onBack} />
        <Card className="rounded-[2rem] border border-white/10 bg-white/10 text-white">
          <CardContent className="space-y-5 p-5">
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950">
              <video ref={videoRef} className="h-72 w-full object-cover" muted playsInline />
              {!cameraReady && (
                <div className="absolute inset-0 grid place-items-center bg-slate-950">
                  <div className="text-center"><Camera className="mx-auto h-10 w-10 text-slate-400" /><p className="mt-3 font-black">Camera scanner</p><p className="mt-1 px-6 text-sm leading-6 text-slate-400">{status}</p></div>
                </div>
              )}
              <div className="pointer-events-none absolute inset-8 rounded-3xl border-4 border-white/70" />
            </div>
            <div className="rounded-2xl bg-slate-950 p-4 text-sm leading-6 text-slate-300">{status}</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="mb-2 text-sm font-bold text-slate-300">Fallback for demo/testing</p>
              <div className="flex gap-2">
                <input value={manualId} onChange={(e) => setManualId(e.target.value)} className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 font-mono text-white outline-none focus:border-indigo-400" placeholder="Paste badge QR value" />
                <Button onClick={() => manualId.trim() && onDetected(manualId)} disabled={!manualId.trim()} className="rounded-2xl bg-indigo-500 px-5 font-black text-white hover:bg-indigo-600">Use</Button>
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
    const { dbUserId, oceanScores } = finalizeAssessment(db, {
      badgeId,
      assessmentId: session.assessmentId,
      choices: next,
      scoringSlides: session.scoringSlides,
    });
    const userId = badgeId;
    const profile = {
      userId,
      name: makeDisplayNameFromBadge(userId),
      badgeQrValue: scannedBadgeValue,
      choices: next,
      vibe: getVibeName(next, oceanScores),
      oceanScores,
      assessmentId: session.assessmentId,
      dbUserId,
      presentationIds: session.presentationIds,
      createdAt: new Date().toISOString(),
    };
    saveStoredProfile(profile);
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
      <AppShell><div className="mx-auto max-w-md"><TopBar title="Badge required" subtitle="Scan your event badge before starting" onBack={onBack} /><Card className="rounded-[2rem] border border-white/10 bg-white/10 text-white"><CardContent className="space-y-5 p-5"><div className="grid h-16 w-16 place-items-center rounded-3xl bg-indigo-500"><QrCode className="h-8 w-8" /></div><h2 className="text-3xl font-black tracking-tight">Start with your badge QR</h2><p className="leading-7 text-slate-300">The badge QR becomes your event user ID. After that, your vibe choices are saved under that ID.</p><Button onClick={onNeedScan} className="w-full rounded-2xl bg-indigo-500 py-6 text-base font-black text-white hover:bg-indigo-600">Scan badge</Button></CardContent></Card></div></AppShell>
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
              <div className="grid h-16 w-16 place-items-center rounded-3xl bg-indigo-500"><Sparkles className="h-8 w-8" /></div>
              <div>
                <h2 className="text-3xl font-black tracking-tight">Badge linked</h2>
                <p className="mt-3 leading-7 text-slate-300">Everyone takes the same 30-question set (from the event test bank), in a fixed shuffled order stored in the app database. Six items per OCEAN facet; each facet score is one of <span className="font-mono text-indigo-200">0, 20, 40, 60, 80, 100</span>. Images live in <span className="font-mono text-indigo-200">/public/assessment/</span> as <span className="font-mono text-indigo-200">{"{id}_1.jpg"}</span> and <span className="font-mono text-indigo-200">{"{id}_2.jpg"}</span> using the original bank id for each question (see <span className="font-mono text-indigo-200">legacyImageIds.js</span>).</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-4 text-left">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">user_id</p>
                <p className="mt-1 break-all font-mono text-sm text-white">{userId}</p>
              </div>
              {error && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div>}
              <Button onClick={() => void handleBegin()} disabled={loading} className="w-full rounded-2xl bg-indigo-500 py-6 text-base font-black text-white hover:bg-indigo-600 disabled:opacity-60">{loading ? "Preparing…" : "Begin"}</Button>
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
    <AppShell><div className="mx-auto max-w-md"><TopBar title="Your VibeCheck" subtitle="Share this badge ID" onBack={onBack} /><Card className="rounded-[2rem] border border-white/10 bg-white/10 text-white"><CardContent className="space-y-5 p-5 text-center"><div className="mx-auto grid h-36 w-36 place-items-center rounded-3xl border-4 border-slate-950 bg-white text-slate-950 shadow-xl"><div className="grid grid-cols-6 gap-1">{Array.from({ length: 30 }).map((_, i) => <div key={i} className={`h-3 w-3 ${((i * 7 + profile.userId.length) % 3) ? "bg-slate-950" : "bg-white"}`} />)}</div></div><div><h2 className="text-3xl font-black">{profile.name}</h2><p className="mt-1 text-indigo-200">{profile.vibe}</p></div><DataBox label="user_id" value={profile.userId} />{profile.oceanScores && <DataBox label="O · C · E · A · N" value={`${profile.oceanScores.o} · ${profile.oceanScores.c} · ${profile.oceanScores.e} · ${profile.oceanScores.a} · ${profile.oceanScores.n}`} />}<DataBox label="choices" value={`[${profile.choices.join(",")}]`} /><Button onClick={onFind} className="w-full rounded-2xl bg-indigo-500 py-6 font-black text-white hover:bg-indigo-600">Find a match</Button></CardContent></Card></div></AppShell>
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
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return samplePeople;
    return samplePeople.filter((p) => `${p.name} ${p.role} ${p.company} ${p.userId}`.toLowerCase().includes(q));
  }, [query]);

  return (
    <AppShell><div className="mx-auto max-w-md lg:max-w-3xl"><TopBar title="Find by name" subtitle="Search sample attendees" onBack={onBack} />{!profile && <NeedProfileNotice />}<div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3"><Search className="h-5 w-5 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent text-white outline-none placeholder:text-slate-500" placeholder="Search Maya, founder, designer..." /></div><div className="grid gap-3 lg:grid-cols-2">{results.map((person) => <PersonRow key={person.userId} person={person} profile={profile} onClick={() => profile && onMatch(person)} />)}</div></div></AppShell>
  );
}

function PersonRow({ person, profile, onClick }) {
  const score = profile ? listMatchPercent(profile, person) : null;
  return <button onClick={onClick} disabled={!profile} className="flex w-full items-center gap-4 rounded-[1.5rem] border border-white/10 bg-white/10 p-4 text-left shadow-lg disabled:opacity-60 active:scale-[0.99]"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-400/20 text-indigo-200"><UsersRound className="h-6 w-6" /></div><div className="min-w-0 flex-1"><p className="truncate font-black text-white">{person.name}</p><p className="truncate text-sm text-slate-300">{person.role} · {person.company}</p></div>{score !== null && <div className="rounded-full bg-white px-3 py-1 text-sm font-black text-slate-950">{score}%</div>}</button>;
}

function ScanScreen({ profile, onBack, onMatch }) {
  const [scannedValue, setScannedValue] = useState(null);
  const scannedId = scannedValue ? makeUserIdFromBadge(scannedValue) : "";
  const found = scannedValue ? samplePeople.find((p) => p.userId.toLowerCase() === scannedId.toLowerCase() || p.userId.toLowerCase() === String(scannedValue).trim().toLowerCase()) : null;

  if (!scannedValue) return <QrScanner title="Scan attendee QR" subtitle="Scan someone’s badge to check match" onBack={onBack} onDetected={setScannedValue} />;

  return (
    <AppShell><div className="mx-auto max-w-md"><TopBar title="QR detected" subtitle="Check this attendee match" onBack={() => setScannedValue(null)} />{!profile && <NeedProfileNotice />}<Card className="rounded-[2rem] border border-white/10 bg-white/10 text-white"><CardContent className="space-y-5 p-5"><DataBox label="scanned value" value={scannedValue} /><DataBox label="normalized user_id" value={scannedId} />{found ? <div className="rounded-2xl bg-slate-950 p-4"><p className="font-black">{found.name}</p><p className="text-sm text-slate-400">{found.role} · {found.company}</p></div> : <div className="rounded-2xl bg-rose-500/10 p-4 text-rose-200">This badge ID was scanned, but it is not in the sample attendee data yet.</div>}<Button onClick={() => found && profile && onMatch(found)} disabled={!found || !profile} className="w-full rounded-2xl bg-indigo-500 py-6 font-black text-white hover:bg-indigo-600 disabled:opacity-50">Show match</Button><Button onClick={() => setScannedValue(null)} className="w-full rounded-2xl bg-white/10 py-6 font-black text-white hover:bg-white/20">Scan again</Button></CardContent></Card></div></AppShell>
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
  const details = getMatchDetails(profile.choices, person.choices);

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
                  <p className="mt-3 text-center font-mono text-sm text-slate-300">Overall (weighted): <span className="font-black text-white">{dyadic.overall}%</span></p>
                </div>
              )}

              {useDyadic && (
                <div className="rounded-2xl bg-white/5 px-4 py-3 text-center text-sm text-slate-300">
                  Image choice overlap (same side picks): <span className="font-black text-white">{choiceOverlap}%</span>
                </div>
              )}

              <InfoBlock
                title="Why you may click"
                items={details.similarities.length ? details.similarities : ["You have enough overlap to start comfortably."]}
                tone="green"
              />
              <InfoBlock
                title="Possible friction"
                items={details.differences.length ? details.differences : ["Very few obvious friction points from this simplified test."]}
                tone="orange"
              />

              <div className="rounded-2xl bg-slate-950 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Suggested opener</p>
                <p className="mt-2 text-lg font-black leading-7">“{person.opener}”</p>
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
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-400 sm:text-xs">
          O {oceanScores.o} · C {oceanScores.c} · E {oceanScores.e} · A {oceanScores.a} · N {oceanScores.n}
        </p>
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
    return <QrScanner title="Scan your badge" subtitle="Your badge QR becomes your VibeCheck ID" onBack={goHome} onDetected={(value) => { setScannedBadgeValue(value); setScreen("test"); }} />;
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
