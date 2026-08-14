const { Router } = require('express');
const auth = require('../middleware/auth');
const { getAccounts, getAccount, getLatestUsage, saveUsageSnapshot } = require('../db');
const { fetchUsage, fetchDailyUsage, fetchApplyServerId } = require('../scraper');
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
    const monthlyPct = a.monthly_pct ?? 100;
    const weeklyPct = a.weekly_pct ?? 100;
    const rollingPct = a.rolling_pct ?? 100;
    const rewardAmount = (a.reward_amount_cents ?? 500) / 100;
    const totalRewards = a.reward_total ?? 0;
    const unusedRewards = a.reward_unused ?? 0;
    let topModels = [];
    try { topModels = JSON.parse(a.daily_models_json || '[]'); } catch (_) {}
    let rewards = [];
    try {
      rewards = (JSON.parse(a.rewards_json || '[]') || [])
        .filter(r => r.status === 'available')
        .slice(0, 3)
        .map(r => ({ id: r.id, email: r.email, amount: r.amount }));
    } catch (_) {}
    // ponytail: SQLite datetime('now') 是 UTC，转为东八区
    const fetchedAt = a.fetched_at ? utcToBeijing(a.fetched_at) : null;
    return {
      ...a,
      fetched_at: fetchedAt,
      rolling_pct: rollingPct,
      weekly_pct: weeklyPct,
      monthly_pct: monthlyPct,
      balance_total: 60 + totalRewards * rewardAmount,
      balance_remaining: 60 * (1 - monthlyPct / 100) + unusedRewards * rewardAmount,
      topModels,
      rewards,
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

// 应用一条邀请奖励（seroval 序列化参数 [workspaceId, referralId] 调用 go.referral.reward.apply）
router.post('/rewards/apply', async (req, res) => {
  const { accountId, referralId } = req.body || {};
  if (!accountId || !referralId) {
    return res.status(400).json({ error: '缺少必填字段：accountId, referralId' });
  }
  const account = getAccount(accountId);
  if (!account) return res.status(404).json({ error: '账号不存在' });

  const cookieStr = account.auth_cookie.includes('auth=') ? account.auth_cookie : `auth=${account.auth_cookie}`;

  let serverId;
  try {
    serverId = await fetchApplyServerId(account.workspace_id, account.auth_cookie);
  } catch (err) {
    return res.status(502).json({ error: `应用奖励失败：${err.message}` });
  }

  const body = JSON.stringify({
    t: { t: 9, i: 0, l: 2, a: [{ t: 1, s: account.workspace_id }, { t: 1, s: referralId }], o: 0 },
    f: 31,
    m: [],
  });

  let resp;
  try {
    resp = await fetch('https://opencode.ai/_server', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieStr,
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://opencode.ai',
        'Referer': `https://opencode.ai/workspace/${account.workspace_id}/go`,
        'x-server-id': serverId,
        'x-server-instance': 'server-fn:0',
      },
      body,
    });
  } catch (err) {
    return res.status(502).json({ error: `应用奖励失败：${err.message}` });
  }

  if (!resp.ok) {
    const errMsg = resp.headers.get('x-error') || (await resp.text().catch(() => '')) || `HTTP ${resp.status}`;
    return res.status(502).json({ error: `应用奖励失败：${errMsg}` });
  }

  await pollAccount(account);
  res.json({ ok: true });
});

module.exports = { router, pollAll };