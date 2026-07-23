// ponytail: sql.js (WebAssembly) 替代 better-sqlite3，免编译，Windows 开箱即用
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db;
let dbPath;

function save() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

async function initDb(filePath) {
  dbPath = filePath || path.join(__dirname, '..', 'data', 'data.db');
  const SQL = await initSqlJs();

  // 确保数据目录存在
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // ponytail: 从旧位置迁移数据（根目录 data.db → data/data.db）
  const oldPath = path.join(__dirname, '..', 'data.db');
  if (!fs.existsSync(dbPath) && fs.existsSync(oldPath)) {
    fs.copyFileSync(oldPath, dbPath);
  }

  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      auth_cookie TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ponytail: 兼容旧表，尝试添加缺失列
  const accCols = queryAll("PRAGMA table_info(accounts)").map(r => r.name);
  if (!accCols.includes('sort_order')) {
    try { db.run("ALTER TABLE accounts ADD COLUMN sort_order INTEGER DEFAULT 0"); } catch (_) {}
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS usage_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      rolling_pct REAL,
      rolling_reset_at TEXT,
      weekly_pct REAL,
      weekly_reset_at TEXT,
      monthly_pct REAL,
      monthly_reset_at TEXT,
      invitation_rewards_count INTEGER,
      reward_total INTEGER,
      reward_used INTEGER,
      reward_unused INTEGER,
      reward_amount_cents INTEGER,
      daily_cost REAL,
      daily_models_json TEXT,
      fetched_at TEXT DEFAULT (datetime('now')),
      error TEXT
    )
  `);

  // ponytail: 兼容旧表，尝试添加缺失列
  const cols = ['reward_total', 'reward_used', 'reward_unused', 'reward_amount_cents', 'daily_cost', 'daily_models_json'];
  const existing = queryAll("PRAGMA table_info(usage_snapshots)").map(r => r.name);
  for (const col of cols) {
    if (!existing.includes(col)) {
      try { db.run(`ALTER TABLE usage_snapshots ADD COLUMN ${col} INTEGER`); } catch (_) {}
    }
  }

  save();
  return db;
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function getAccounts() {
  return queryAll(
    "SELECT id, name, workspace_id, substr(auth_cookie,1,10) || '...' as auth_cookie_preview, sort_order, created_at, updated_at FROM accounts ORDER BY sort_order ASC, id ASC"
  );
}

function getAccount(id) {
  return queryOne('SELECT * FROM accounts WHERE id = ?', [id]);
}

function createAccount(name, workspaceId, authCookie) {
  db.run('INSERT INTO accounts (name, workspace_id, auth_cookie) VALUES (?, ?, ?)', [name, workspaceId, authCookie]);
  save();
  const row = queryOne('SELECT last_insert_rowid() as id');
  return row;
}

function updateAccount(id, name, workspaceId, authCookie) {
  const fields = [];
  const params = [];
  if (name !== undefined) { fields.push('name = ?'); params.push(name); }
  if (workspaceId !== undefined) { fields.push('workspace_id = ?'); params.push(workspaceId); }
  if (authCookie !== undefined) { fields.push('auth_cookie = ?'); params.push(authCookie); }
  if (fields.length === 0) return null;
  fields.push("updated_at = datetime('now')");
  params.push(id);
  db.run(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`, params);
  save();
  return { ok: true };
}

function deleteAccount(id) {
  db.run('DELETE FROM usage_snapshots WHERE account_id = ?', [id]);
  db.run('DELETE FROM accounts WHERE id = ?', [id]);
  save();
  return { ok: true };
}

function saveUsageSnapshot(accountId, data) {
  if (data.error) {
    db.run('INSERT INTO usage_snapshots (account_id, error) VALUES (?, ?)', [accountId, data.error]);
  } else {
    db.run(
      `INSERT INTO usage_snapshots 
       (account_id, rolling_pct, rolling_reset_at, weekly_pct, weekly_reset_at, monthly_pct, monthly_reset_at,
        invitation_rewards_count, reward_total, reward_used, reward_unused, reward_amount_cents, daily_cost, daily_models_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        accountId,
        data.rolling?.pct ?? null,
        data.rolling?.resetAt ?? null,
        data.weekly?.pct ?? null,
        data.weekly?.resetAt ?? null,
        data.monthly?.pct ?? null,
        data.monthly?.resetAt ?? null,
        data.rewards?.total ?? null,
        data.rewards?.total ?? null,
        data.rewards?.used ?? null,
        data.rewards?.unused ?? null,
        data.rewards?.rewardAmount ?? null,
        data.dailyCost ?? null,
        data.topModels ? JSON.stringify(data.topModels) : null,
      ]
    );
  }
  save();
}

function getLatestUsage() {
  return queryAll(`
    SELECT a.id, a.name, a.workspace_id,
           s.rolling_pct, s.rolling_reset_at,
           s.weekly_pct, s.weekly_reset_at,
           s.monthly_pct, s.monthly_reset_at,
           s.invitation_rewards_count,
           s.reward_total, s.reward_used, s.reward_unused, s.reward_amount_cents,
           s.daily_cost, s.daily_models_json,
           s.fetched_at, s.error
    FROM accounts a
    LEFT JOIN (
      SELECT account_id, 
             rolling_pct, rolling_reset_at,
             weekly_pct, weekly_reset_at,
             monthly_pct, monthly_reset_at,
             invitation_rewards_count,
              reward_total, reward_used, reward_unused, reward_amount_cents,
              daily_cost, daily_models_json,
              fetched_at, error,
             ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY id DESC) as rn
      FROM usage_snapshots
    ) s ON a.id = s.account_id AND s.rn = 1
    ORDER BY a.sort_order ASC, a.id ASC
  `);
}

function reorderAccounts(ids) {
  const stmt = db.prepare("UPDATE accounts SET sort_order = ? WHERE id = ?");
  ids.forEach((id, idx) => stmt.run([idx, id]));
  stmt.free();
  save();
}

module.exports = { initDb, getAccounts, getAccount, createAccount, updateAccount, deleteAccount, reorderAccounts, saveUsageSnapshot, getLatestUsage };