import initSqlJs from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { SCHEMA_SQL } from "./schema.js";

/** @typedef {import("sql.js").Database} SqlDatabase */

const STORAGE_KEY = "vibesummit_sqlite";

let initPromise;

function getInitSqlJs() {
  if (!initPromise) {
    initPromise = initSqlJs({ locateFile: () => sqlWasmUrl });
  }
  return initPromise;
}

/**
 * Opens a new in-memory database, applies schema, enables foreign keys.
 * @param {Uint8Array | null | undefined} persisted
 * @returns {Promise<SqlDatabase>}
 */
export async function openDatabase(persisted) {
  const SQL = await getInitSqlJs();
  const db = persisted?.byteLength ? new SQL.Database(persisted) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  return db;
}


function runMigrations(db) {
  try {
    const info = db.exec("PRAGMA table_info(users)");
    const columns = info?.[0]?.values?.map((row) => row[1]) || [];
    if (!columns.includes("display_name")) {
      db.run("ALTER TABLE users ADD COLUMN display_name TEXT");
    }
  } catch {
    /* ignore migration errors; schema creation will cover fresh DBs */
  }
}

/** @type {Promise<SqlDatabase> | undefined} */
let singleton;

function loadPersistedBytes() {
  try {
    const b64 = typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY);
    if (!b64) return undefined;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return undefined;
  }
}

/**
 * Shared app database; restores from localStorage when present.
 * @returns {Promise<SqlDatabase>}
 */
export function getDatabase() {
  if (!singleton) {
    singleton = openDatabase(loadPersistedBytes());
  }
  return singleton;
}

/**
 * Replace the singleton with a DB restored from {@link serializeDatabase}.
 * @param {Uint8Array} data
 * @returns {Promise<SqlDatabase>}
 */
export async function hydrateDatabase(data) {
  const db = await openDatabase(data);
  singleton = Promise.resolve(db);
  return db;
}

/**
 * @param {SqlDatabase} db
 * @returns {Uint8Array}
 */
export function serializeDatabase(db) {
  return db.export();
}

/**
 * Persist the full DB snapshot (call after writes you care about).
 * @param {SqlDatabase} db
 */
export function persistAppDatabase(db) {
  try {
    const bytes = db.export();
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    localStorage.setItem(STORAGE_KEY, btoa(binary));
  } catch {
    /* ignore quota / private mode */
  }
}

/** @returns {number} Unix epoch milliseconds */
export function nowMs() {
  return Date.now();
}
