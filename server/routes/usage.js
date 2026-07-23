const { Router } = require('express');
const auth = require('../middleware/auth');
const { getAccounts, getAccount, getLatestUsage, saveUsageSnapshot } = require('../db');
const { fetchUsage, fetchDailyUsage } = require('../scraper');
const log = require('../logger');

const router = Router();
router.use(auth);

let lastPollAt = null;

async function pollAccount(account) {
  try {
    const data = await fetchUsage(account.workspace_id, account.auth_cookie);
    // 同时抓取每日用量
    try {
      const daily = await fetchDailyUsage(account.workspace_id, account.auth_cookie);
      data.dailyCost = daily.dailyCost;
      data.topModels = daily.topModels;
    } catch (dailyErr) {
      log.warn(`[poll] ${account.name} daily: ${dailyErr.message}`);
    }
    saveUsageSnapshot(account.id, data);
    log.info(`[poll] ${account.name}: OK`);
  } catch (err) {
    saveUsageSnapshot(account.id, { error: err.message });
    log.warn(`[poll] ${account.name}: ${err.message}`);
  }
}

async function pollAll() {
  const list = getAccounts();
  for (const a of list) {
    const full = getAccount(a.id);
    await pollAccount(full);
  }
  lastPollAt = new Date().toISOString();
}

router.get('/', (req, res) => {
  const accounts = getLatestUsage().map(a => {
    const monthlyPct = a.monthly_pct ?? 0;
    const rewardAmount = (a.reward_amount_cents ?? 500) / 100;
    const totalRewards = a.reward_total ?? 0;
    const unusedRewards = a.reward_unused ?? 0;
    let topModels = [];
    try { topModels = JSON.parse(a.daily_models_json || '[]'); } catch (_) {}
    // ponytail: SQLite datetime('now') 是 UTC，转为东八区
    const fetchedAt = a.fetched_at ? utcToBeijing(a.fetched_at) : null;
    return {
      ...a,
      fetched_at: fetchedAt,
      balance_total: 60 + totalRewards * rewardAmount,
      balance_remaining: 60 * (1 - monthlyPct / 100) + unusedRewards * rewardAmount,
      topModels,
    };
  });
  res.json({ accounts, lastPollAt });
});

function utcToBeijing(utcStr) {
  const d = new Date(utcStr + 'Z');
  d.setHours(d.getHours() + 8);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

router.post('/fetch', async (req, res) => {
  await pollAll();
  res.json({ ok: true });
});

module.exports = { router, pollAll };