/** @param {import("sql.js").Database} db */
export function lastInsertRowId(db) {
  const rows = db.exec("SELECT last_insert_rowid() AS id");
  if (!rows.length || !rows[0].values.length) return 0;
  return Number(rows[0].values[0][0]);
}

/**
 * @param {import("sql.js").Database} db
 * @param {string} sql
 * @param {unknown[]} [params]
 */
export function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out = [];
  while (stmt.step()) {
    out.push(stmt.getAsObject());
  }
  stmt.free();
  return out;
}

/**
 * @param {import("sql.js").Database} db
 * @param {string} sql
 * @param {unknown[]} [params]
 */
export function queryOne(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows[0] ?? null;
}
