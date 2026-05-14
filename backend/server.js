const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "profiles.json");

app.use(cors({
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",").map((x) => x.trim()) : "*",
}));
app.use(express.json({ limit: "1mb" }));

function normalizeBadgeId(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_|_$/g, "");
}

function friendlyBadgeId(value) {
  const raw = String(value || "").trim();
  const pipeParts = raw.split("|").map((part) => part.trim()).filter(Boolean);
  if (pipeParts.length > 1) return pipeParts[pipeParts.length - 1];
  const underscoreParts = raw.split("_").map((part) => part.trim()).filter(Boolean);
  const last = underscoreParts[underscoreParts.length - 1];
  if (underscoreParts.length > 1 && /^[a-zA-Z0-9-]{4,16}$/.test(last)) return last;
  return raw.slice(0, 8).toUpperCase();
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

function readProfiles() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeProfiles(profiles) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(profiles, null, 2), "utf8");
}

function publicProfile(profile) {
  return {
    userId: profile.userId,
    name: profile.name,
    badgeQrValue: profile.badgeQrValue,
    friendlyBadgeId: profile.friendlyBadgeId,
    choices: Array.isArray(profile.choices) ? profile.choices.map((v) => Number(v) ? 1 : 0) : [],
    vibe: profile.vibe,
    oceanScores: profile.oceanScores || null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

app.get("/", (req, res) => {
  res.json({ ok: true, service: "VibeSummit backend" });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, profiles: readProfiles().length });
});

app.get("/api/profiles", (req, res) => {
  const profiles = readProfiles()
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .map(publicProfile);
  res.json({ profiles });
});

app.get("/api/profiles/:badgeId", (req, res) => {
  const requested = decodeURIComponent(req.params.badgeId || "");
  const normalized = normalizeBadgeId(requested);
  const friendly = friendlyBadgeId(requested);
  const profile = readProfiles().find((p) => {
    const ids = [
      p.userId,
      p.badgeQrValue,
      p.friendlyBadgeId,
      normalizeBadgeId(p.userId),
      normalizeBadgeId(p.badgeQrValue),
      friendlyBadgeId(p.badgeQrValue || p.userId),
    ].map((x) => String(x || "").toLowerCase());
    return ids.includes(String(requested).toLowerCase()) || ids.includes(normalized.toLowerCase()) || ids.includes(friendly.toLowerCase());
  });

  if (!profile) return res.status(404).json({ error: "Profile not found" });
  res.json({ profile: publicProfile(profile) });
});

app.post("/api/profiles", (req, res) => {
  const input = req.body || {};
  const userId = normalizeBadgeId(input.userId || input.badgeQrValue);
  const choices = Array.isArray(input.choices) ? input.choices.map((v) => Number(v) ? 1 : 0) : [];

  if (!userId || choices.length === 0) {
    return res.status(400).json({ error: "userId/badgeQrValue and choices are required" });
  }

  const now = new Date().toISOString();
  const profile = {
    userId,
    name: String(input.name || "").trim() || "Anonymous Attendee",
    badgeQrValue: String(input.badgeQrValue || input.userId || userId),
    friendlyBadgeId: String(input.friendlyBadgeId || friendlyBadgeId(input.badgeQrValue || userId)),
    choices,
    vibe: String(input.vibe || "Completed profile"),
    oceanScores: input.oceanScores || null,
    createdAt: input.createdAt || now,
    updatedAt: now,
  };

  const profiles = readProfiles();
  const existingIndex = profiles.findIndex((p) => normalizeBadgeId(p.userId || p.badgeQrValue) === userId);
  if (existingIndex >= 0) profiles[existingIndex] = { ...profiles[existingIndex], ...profile, createdAt: profiles[existingIndex].createdAt || profile.createdAt };
  else profiles.push(profile);
  writeProfiles(profiles);

  res.json({ ok: true, profile: publicProfile(profile) });
});

app.listen(PORT, () => {
  console.log(`VibeSummit backend listening on port ${PORT}`);
});
