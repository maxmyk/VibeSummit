/** SQLite DDL for the VibeSummit app (sql.js). Run after `PRAGMA foreign_keys = ON`. */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS assessments (
  assessment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_count INTEGER NOT NULL,
  question_ids TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  question_id INTEGER PRIMARY KEY AUTOINCREMENT,
  high_first INTEGER NOT NULL CHECK (high_first IN (0, 1)),
  ocean_score REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments (assessment_id),
  badge_id TEXT,
  answers TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_vibe (
  user_id INTEGER PRIMARY KEY REFERENCES users (user_id) ON DELETE CASCADE,
  o_score REAL NOT NULL,
  c_score REAL NOT NULL,
  e_score REAL NOT NULL,
  a_score REAL NOT NULL,
  n_score REAL NOT NULL
);
`;
