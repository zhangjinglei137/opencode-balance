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
  // New API 渠道字段
  if (!accCols.includes('new_api_channel_id')) {
    try { db.run("ALTER TABLE accounts ADD COLUMN new_api_channel_id INTEGER"); } catch (_) {}
  }
  if (!accCols.includes('sync_balance_enabled')) {
    try { db.run("ALTER TABLE accounts ADD COLUMN sync_balance_enabled INTEGER DEFAULT 0"); } catch (_) {}
  }
  if (!accCols.includes('sync_priority_enabled')) {
    try { db.run("ALTER TABLE accounts ADD COLUMN sync_priority_enabled INTEGER DEFAULT 0"); } catch (_) {}
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

  db.run(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      sync_type TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS algorithm_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rolling_period_hours REAL DEFAULT 5,
      weekly_period_days REAL DEFAULT 7,
      monthly_period_days REAL DEFAULT 30,
      weight_rolling REAL DEFAULT 0.1,
      weight_weekly REAL DEFAULT 0.2,
      weight_monthly REAL DEFAULT 0.7,
      bonus_cap_rolling REAL DEFAULT 0.1,
      bonus_cap_weekly REAL DEFAULT 0.2,
      bonus_cap_monthly REAL DEFAULT 0.7,
      tier_threshold REAL DEFAULT 0.3,
      fuse_rolling_warn REAL DEFAULT 0.9,
      fuse_rolling_disable REAL DEFAULT 0.98,
      fuse_weekly_warn REAL DEFAULT 0.95,
      fuse_monthly_warn REAL DEFAULT 0.98,
      fuse_monthly_disable REAL DEFAULT 1.0,
      sync_balance_interval_minutes INTEGER DEFAULT 10,
      sync_priority_interval_minutes INTEGER DEFAULT 30
    )
  `);

  // 确保有默认配置
  if (!queryOne("SELECT id FROM algorithm_config LIMIT 1")) {
    db.run("INSERT INTO algorithm_config DEFAULT VALUES");
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
    "SELECT id, name, workspace_id, substr(auth_cookie,1,10) || '...' as auth_cookie_preview, sort_order, new_api_channel_id, sync_balance_enabled, sync_priority_enabled, created_at, updated_at FROM accounts ORDER BY sort_order ASC, id ASC"
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

function updateAccount(id, name, workspaceId, authCookie, newApiChannelId, syncBalanceEnabled, syncPriorityEnabled) {
  const fields = [];
  const params = [];
  if (name !== undefined) { fields.push('name = ?'); params.push(name); }
  if (workspaceId !== undefined) { fields.push('workspace_id = ?'); params.push(workspaceId); }
  if (authCookie !== undefined) { fields.push('auth_cookie = ?'); params.push(authCookie); }
  if (newApiChannelId !== undefined) { fields.push('new_api_channel_id = ?'); params.push(newApiChannelId); }
  if (syncBalanceEnabled !== undefined) { fields.push('sync_balance_enabled = ?'); params.push(syncBalanceEnabled ? 1 : 0); }
  if (syncPriorityEnabled !== undefined) { fields.push('sync_priority_enabled = ?'); params.push(syncPriorityEnabled ? 1 : 0); }
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

function updateAccountChannel(id, newApiChannelId, syncBalanceEnabled, syncPriorityEnabled) {
  const fields = [];
  const params = [];
  if (newApiChannelId !== undefined) { fields.push('new_api_channel_id = ?'); params.push(newApiChannelId); }
  if (syncBalanceEnabled !== undefined) { fields.push('sync_balance_enabled = ?'); params.push(syncBalanceEnabled ? 1 : 0); }
  if (syncPriorityEnabled !== undefined) { fields.push('sync_priority_enabled = ?'); params.push(syncPriorityEnabled ? 1 : 0); }
  if (fields.length === 0) return null;
  fields.push("updated_at = datetime('now')");
  params.push(id);
  db.run(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`, params);
  save();
  return { ok: true };
}

function getAccountsWithChannel() {
  return queryAll("SELECT id, name, new_api_channel_id, sync_balance_enabled, sync_priority_enabled FROM accounts ORDER BY sort_order ASC, id ASC");
}

function addSyncLog(accountId, syncType, status, message) {
  db.run('INSERT INTO sync_logs (account_id, sync_type, status, message) VALUES (?, ?, ?, ?)', [accountId, syncType, status, message]);
  db.run('DELETE FROM sync_logs WHERE id NOT IN (SELECT id FROM sync_logs ORDER BY id DESC LIMIT 500)');
  save();
}

function getSyncLogs(limit = 50) {
  return queryAll("SELECT * FROM sync_logs ORDER BY id DESC LIMIT ?", [limit]);
}

function getAlgorithmConfig() {
  return queryOne("SELECT * FROM algorithm_config ORDER BY id LIMIT 1");
}

function updateAlgorithmConfig(params) {
  const allowed = [
    'rolling_period_hours', 'weekly_period_days', 'monthly_period_days',
    'weight_rolling', 'weight_weekly', 'weight_monthly',
    'bonus_cap_rolling', 'bonus_cap_weekly', 'bonus_cap_monthly',
    'tier_threshold',
    'fuse_rolling_warn', 'fuse_rolling_disable', 'fuse_weekly_warn',
    'fuse_monthly_warn', 'fuse_monthly_disable',
    'sync_balance_interval_minutes', 'sync_priority_interval_minutes',
  ];
  const fields = [];
  const vals = [];
  for (const key of allowed) {
    if (params[key] !== undefined) {
      fields.push(`${key} = ?`);
      vals.push(params[key]);
    }
  }
  if (fields.length === 0) return null;
  db.run(`UPDATE algorithm_config SET ${fields.join(', ')} WHERE id = (SELECT id FROM algorithm_config ORDER BY id LIMIT 1)`, vals);
  save();
  return { ok: true };
}

module.exports = { initDb, getAccounts, getAccount, createAccount, updateAccount, deleteAccount, reorderAccounts, saveUsageSnapshot, getLatestUsage, updateAccountChannel, getAccountsWithChannel, addSyncLog, getSyncLogs, getAlgorithmConfig, updateAlgorithmConfig };