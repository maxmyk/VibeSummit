import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, ChevronLeft, HeartHandshake, QrCode, Search, Sparkles, UserRound, UsersRound } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

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

const questions = [
  {
    id: 1,
    prompt: "What feels more like you at an event?",
    left: { label: "Deep conversation", image: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=800&q=80", value: 0 },
    right: { label: "Meeting many people", image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80", value: 1 },
  },
  {
    id: 2,
    prompt: "Which room would you rather enter?",
    left: { label: "Quiet workshop", image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=800&q=80", value: 0 },
    right: { label: "Busy mixer", image: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=800&q=80", value: 1 },
  },
  {
    id: 3,
    prompt: "What kind of session catches your eye?",
    left: { label: "Technical demo", image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80", value: 0 },
    right: { label: "Big vision talk", image: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=800&q=80", value: 1 },
  },
  {
    id: 4,
    prompt: "How do you like to start conversations?",
    left: { label: "With a clear topic", image: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=800&q=80", value: 0 },
    right: { label: "With open curiosity", image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=800&q=80", value: 1 },
  },
  {
    id: 5,
    prompt: "What sounds more energizing?",
    left: { label: "Build something useful", image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&q=80", value: 0 },
    right: { label: "Explore something new", image: "https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=800&q=80", value: 1 },
  },
  {
    id: 6,
    prompt: "Pick your preferred event rhythm.",
    left: { label: "Planned schedule", image: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=800&q=80", value: 0 },
    right: { label: "Spontaneous flow", image: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=800&q=80", value: 1 },
  },
  {
    id: 7,
    prompt: "Which person do you click with faster?",
    left: { label: "Practical problem-solver", image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80", value: 0 },
    right: { label: "Creative brainstormer", image: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&q=80", value: 1 },
  },
  {
    id: 8,
    prompt: "What do you usually notice first?",
    left: { label: "How it works", image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80", value: 0 },
    right: { label: "How it feels", image: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80", value: 1 },
  },
];

const samplePeople = [
  { userId: "u_maya_24", name: "Maya Chen", role: "Product Designer", company: "Early-stage startup", choices: [1, 1, 1, 1, 1, 1, 1, 1], vibe: "Creative Connector", opener: "What’s one product experience here that actually impressed you?" },
  { userId: "u_andre_18", name: "Andre Wilson", role: "Backend Developer", company: "Cloud tools company", choices: [0, 0, 0, 0, 0, 0, 0, 0], vibe: "Practical Builder", opener: "What’s a technical problem you’ve seen solved well recently?" },
  { userId: "u_sofia_31", name: "Sofia Martinez", role: "Data Analyst", company: "Climate analytics startup", choices: [0, 1, 0, 1, 0, 1, 0, 1], vibe: "Curious Analyst", opener: "What data or trend here surprised you today?" },
  { userId: "u_noah_45", name: "Noah Kim", role: "Founder", company: "AI meeting assistant", choices: [1, 1, 0, 1, 1, 1, 0, 1], vibe: "Energetic Explorer", opener: "What are you building, and what made you start?" },
  { userId: "u_ella_77", name: "Ella Thompson", role: "UX Researcher", company: "Design lab", choices: [0, 1, 1, 1, 1, 0, 1, 1], vibe: "Empathetic Strategist", opener: "What kind of conversations are you hoping to have here?" },
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

function getFriendlyBadgeId(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "UNKNOWN";

  const parts = raw.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return parts[parts.length - 1];

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

function getVibeName(choices) {
  const ones = choices.reduce((sum, v) => sum + v, 0);
  const firstHalf = choices.slice(0, Math.ceil(choices.length / 2)).reduce((sum, v) => sum + v, 0);
  const secondHalf = choices.slice(Math.ceil(choices.length / 2)).reduce((sum, v) => sum + v, 0);
  if (ones <= 2) return "Focused Builder";
  if (ones >= 6) return "Social Explorer";
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
  const similarities = [];
  const differences = [];
  for (let i = 0; i < Math.min(myChoices.length, theirChoices.length, labels.length); i++) {
    if (myChoices[i] === theirChoices[i]) similarities.push(`You both lean toward ${labels[i][myChoices[i]]}.`);
    else differences.push(`You lean toward ${labels[i][myChoices[i]]}, while they lean toward ${labels[i][theirChoices[i]]}.`);
  }
  return { similarities: similarities.slice(0, 2), differences: differences.slice(0, 2) };
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
      } catch (error) {
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

function TestScreen({ scannedBadgeValue, onDone, onBack, onNeedScan }) {
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState([]);
  const [started, setStarted] = useState(false);
  const progress = Math.round((choices.length / questions.length) * 100);
  const question = questions[index];

  function choose(value) {
    const next = [...choices, value];
    if (next.length >= questions.length) {
      const userId = makeUserIdFromBadge(scannedBadgeValue);
      const profile = {
        userId,
        name: makeDisplayNameFromBadge(scannedBadgeValue),
        badgeQrValue: scannedBadgeValue,
        friendlyBadgeId: getFriendlyBadgeId(scannedBadgeValue),
        choices: next,
        vibe: getVibeName(next),
        createdAt: new Date().toISOString(),
      };
      saveStoredProfile(profile);
      onDone(profile);
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
      <AppShell><div className="mx-auto max-w-md"><TopBar title="Vibe test" subtitle="Eight quick image choices" onBack={onBack} /><Card className="rounded-[2rem] border border-white/10 bg-white/10 text-white"><CardContent className="space-y-5 p-5"><div className="grid h-16 w-16 place-items-center rounded-3xl bg-indigo-500"><Sparkles className="h-8 w-8" /></div><div><h2 className="text-3xl font-black tracking-tight">Badge linked</h2><p className="mt-3 leading-7 text-slate-300">Your event badge is linked. Now pick one image per question.</p></div><div className="rounded-2xl bg-slate-950 p-4 text-left"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">badge token</p><p className="mt-1 break-all font-mono text-sm text-white">{getFriendlyBadgeId(scannedBadgeValue)}</p></div><Button onClick={() => setStarted(true)} className="w-full rounded-2xl bg-indigo-500 py-6 text-base font-black text-white hover:bg-indigo-600">Begin</Button></CardContent></Card></div></AppShell>
    );
  }

  return (
    <AppShell>
      <TopBar title="Choose your vibe" subtitle={`Question ${index + 1} of ${questions.length}`} onBack={onBack} />
      <div className="mb-5 h-3 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-indigo-400" animate={{ width: `${progress}%` }} /></div>
      <AnimatePresence mode="wait">
        <motion.div key={question.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
          <h2 className="mx-auto mb-5 max-w-3xl text-2xl font-black leading-tight tracking-tight sm:text-3xl">{question.prompt}</h2>
          <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
            <ChoiceCard choice={question.left} onChoose={() => choose(question.left.value)} />
            <ChoiceCard choice={question.right} onChoose={() => choose(question.right.value)} />
          </div>
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}

function ChoiceCard({ choice, onChoose }) {
  return (
    <button onClick={onChoose} className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/10 text-left shadow-xl active:scale-[0.99]">
      <img src={choice.image} alt={choice.label} className="h-44 w-full object-cover sm:h-56 lg:h-72" />
      <div className="flex items-center justify-between gap-3 p-4"><p className="text-lg font-black text-white sm:text-xl">{choice.label}</p><div className="rounded-full bg-white px-3 py-1 text-sm font-black text-slate-950">Pick</div></div>
    </button>
  );
}

function ProfileScreen({ profile, onBack, onFind }) {
  if (!profile) return <AppShell><TopBar title="No profile yet" onBack={onBack} /></AppShell>;
  return (
    <AppShell><div className="mx-auto max-w-md"><TopBar title="Your VibeSummit" subtitle="Share this badge ID" onBack={onBack} /><Card className="rounded-[2rem] border border-white/10 bg-white/10 text-white"><CardContent className="space-y-5 p-5 text-center"><div className="mx-auto grid h-36 w-36 place-items-center rounded-3xl border-4 border-slate-950 bg-white text-slate-950 shadow-xl"><div className="grid grid-cols-5 gap-1">{Array.from({ length: 25 }).map((_, i) => <div key={i} className={`h-3 w-3 ${((i * 7 + profile.userId.length) % 3) ? "bg-slate-950" : "bg-white"}`} />)}</div></div><div><h2 className="text-3xl font-black">{profile.name}</h2><p className="mt-1 text-indigo-200">{profile.vibe}</p></div><DataBox label="badge token" value={profile.friendlyBadgeId || getFriendlyBadgeId(profile.badgeQrValue || profile.userId)} /><Button onClick={onFind} className="w-full rounded-2xl bg-indigo-500 py-6 font-black text-white hover:bg-indigo-600">Find a match</Button></CardContent></Card></div></AppShell>
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
    <AppShell>
      <div className="mx-auto w-full max-w-md lg:max-w-3xl">
        <TopBar title="Find by name" subtitle="Search sample attendees" onBack={onBack} />
        {!profile && <NeedProfileNotice />}

        <div className="mb-4 flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-500"
            placeholder="Search name, role..."
          />
        </div>

        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {results.map((person) => (
            <PersonRow key={person.userId} person={person} profile={profile} onClick={() => profile && onMatch(person)} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function PersonRow({ person, profile, onClick }) {
  const score = profile ? matchScore(profile.choices, person.choices) : null;

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
        <p className="truncate text-xs text-slate-300 sm:text-sm">{person.role}</p>
        <p className="truncate text-xs text-slate-500 sm:hidden">{person.company}</p>
        <p className="hidden truncate text-sm text-slate-300 sm:block">{person.role} · {person.company}</p>
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
  const scannedId = scannedValue ? makeUserIdFromBadge(scannedValue) : "";
  const found = scannedValue ? samplePeople.find((p) => p.userId.toLowerCase() === scannedId.toLowerCase() || p.userId.toLowerCase() === String(scannedValue).trim().toLowerCase()) : null;

  if (!scannedValue) return <QrScanner title="Scan attendee QR" subtitle="Scan someone’s badge to check match" onBack={onBack} onDetected={setScannedValue} />;

  return (
    <AppShell><div className="mx-auto max-w-md"><TopBar title="QR detected" subtitle="Check this attendee match" onBack={() => setScannedValue(null)} />{!profile && <NeedProfileNotice />}<Card className="rounded-[2rem] border border-white/10 bg-white/10 text-white"><CardContent className="space-y-5 p-5"><DataBox label="scanned value" value={scannedValue} /><DataBox label="normalized user_id" value={scannedId} />{found ? <div className="rounded-2xl bg-slate-950 p-4"><p className="font-black">{found.name}</p><p className="text-sm text-slate-400">{found.role} · {found.company}</p></div> : <div className="rounded-2xl bg-rose-500/10 p-4 text-rose-200">This badge ID was scanned, but it is not in the sample attendee data yet.</div>}<Button onClick={() => found && profile && onMatch(found)} disabled={!found || !profile} className="w-full rounded-2xl bg-indigo-500 py-6 font-black text-white hover:bg-indigo-600 disabled:opacity-50">Show match</Button><Button onClick={() => setScannedValue(null)} className="w-full rounded-2xl bg-white/10 py-6 font-black text-white hover:bg-white/20">Scan again</Button></CardContent></Card></div></AppShell>
  );
}

function MatchScreen({ profile, person, onBack }) {
  const score = matchScore(profile.choices, person.choices);
  const details = getMatchDetails(profile.choices, person.choices);
  return (
    <AppShell><div className="mx-auto max-w-md lg:max-w-3xl"><TopBar title="Your match" subtitle={`${profile.name} + ${person.name}`} onBack={onBack} /><Card className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 text-white"><CardContent><div className="bg-gradient-to-br from-indigo-500 to-fuchsia-500 p-6 text-center"><p className="text-sm font-bold uppercase tracking-[0.2em] text-white/70">Vibe match</p><div className="mt-3 text-7xl font-black">{score}%</div><p className="mt-2 text-lg font-bold">{getMatchText(score)}</p></div><div className="space-y-5 p-5"><div className="grid grid-cols-2 gap-3"><MiniProfile title="You" name={profile.name} vibe={profile.vibe} /><MiniProfile title="Them" name={person.name} vibe={person.vibe} /></div>{details.similarities.length > 0 && (
              <InfoBlock title="Why you may click" items={details.similarities} tone="green" />
            )}<InfoBlock
              title={details.similarities.length > 0 ? "Possible friction" : "Conversation contrast"}
              items={
                details.differences.length
                  ? details.differences
                  : ["Very few obvious friction points from this simplified test."]
              }
              tone="orange"
            /><div className="rounded-2xl bg-slate-950 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Suggested opener</p><p className="mt-2 text-lg font-black leading-7">“{person.opener}”</p></div><div className="rounded-2xl bg-white/5 p-4 text-xs leading-5 text-slate-400">Demo note: this is not psychological assessment. It is a lightweight event icebreaker built from binary image choices.</div></div></CardContent></Card></div></AppShell>
  );
}

function MiniProfile({ title, name, vibe }) {
  return <div className="rounded-2xl bg-slate-950 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p><p className="mt-1 truncate font-black">{name}</p><p className="mt-1 text-sm text-indigo-200">{vibe}</p></div>;
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
