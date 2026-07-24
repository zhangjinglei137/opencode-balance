const { Router } = require('express');
const auth = require('../middleware/auth');
const { getAccountsWithChannel, getLatestUsage, addSyncLog, getSyncLogs, getAlgorithmConfig } = require('../db');
const { updateChannel } = require('../newapi-client');
const { updateChannelBalance } = require('../pg-client');
const { calculatePriorities } = require('../algorithm');
const log = require('../logger');

const router = Router();
router.use(auth);

// GET / — 渠道映射 + 用量 + 算法预览
router.get('/', (req, res) => {
  const accs = getAccountsWithChannel();
  const usageMap = {};
  getLatestUsage().forEach(u => { usageMap[u.id] = u; });
  const config = getAlgorithmConfig();
  const algoInputs = [];

  const accounts = accs.map(a => {
    const u = usageMap[a.id];
    const item = {
      id: a.id, name: a.name,
      new_api_channel_id: a.new_api_channel_id,
      sync_balance_enabled: !!a.sync_balance_enabled,
      sync_priority_enabled: !!a.sync_priority_enabled,
      rolling_pct: u ? (u.rolling_pct ?? 0) : 0,
      weekly_pct: u ? (u.weekly_pct ?? 0) : 0,
      monthly_pct: u ? (u.monthly_pct ?? 0) : 0,
      rolling_reset_at: u?.rolling_reset_at || null,
      weekly_reset_at: u?.weekly_reset_at || null,
      monthly_reset_at: u?.monthly_reset_at || null,
      balance_remaining: u
        ? Math.round((60 * (1 - (u.monthly_pct ?? 0) / 100) + (u.reward_unused ?? 0) * ((u.reward_amount_cents ?? 500) / 100)) * 100) / 100
        : null,
    };
    if (a.new_api_channel_id && a.sync_priority_enabled && u) {
      algoInputs.push({
        account_id: a.id, name: a.name,
        rolling_pct: u.rolling_pct ?? 0, weekly_pct: u.weekly_pct ?? 0, monthly_pct: u.monthly_pct ?? 0,
        rolling_reset_at: u.rolling_reset_at, weekly_reset_at: u.weekly_reset_at, monthly_reset_at: u.monthly_reset_at,
      });
    }
    return item;
  });

  const preview = algoInputs.length && config ? calculatePriorities(algoInputs, config) : [];
  res.json({ accounts, algorithm_preview: preview });
});

// POST /sync-balance — 直连 PG 更新余额，绕过 New API 只读限制
router.post('/sync-balance', async (req, res) => {
  const accs = getAccountsWithChannel().filter(a => a.sync_balance_enabled && a.new_api_channel_id);
  const usageMap = {};
  getLatestUsage().forEach(u => { usageMap[u.id] = u; });
  const results = [];

  for (const a of accs) {
    try {
      const u = usageMap[a.id];
      const balance = u
        ? Math.round((60 * (1 - (u.monthly_pct ?? 0) / 100) + (u.reward_unused ?? 0) * ((u.reward_amount_cents ?? 500) / 100)) * 100) / 100
        : 0;
      await updateChannelBalance(a.new_api_channel_id, balance);
      addSyncLog(a.id, 'balance', 'success', `余额 ${balance} 同步成功`);
      results.push({ id: a.id, name: a.name, status: 'success', balance });
    } catch (err) {
      addSyncLog(a.id, 'balance', 'error', `同步失败: ${err.message}`);
      results.push({ id: a.id, name: a.name, status: 'error', error: err.message });
    }
  }
  res.json({ results });
});

// POST /sync-priority
router.post('/sync-priority', async (req, res) => {
  const config = getAlgorithmConfig();
  if (!config) return res.status(400).json({ error: '算法配置不存在' });

  const accs = getAccountsWithChannel().filter(a => a.sync_priority_enabled && a.new_api_channel_id);
  const usageMap = {};
  getLatestUsage().forEach(u => { usageMap[u.id] = u; });

  const algoInputs = accs.map(a => {
    const u = usageMap[a.id];
    return {
      account_id: a.id, name: a.name,
      rolling_pct: u?.rolling_pct ?? 0, weekly_pct: u?.weekly_pct ?? 0, monthly_pct: u?.monthly_pct ?? 0,
      rolling_reset_at: u?.rolling_reset_at, weekly_reset_at: u?.weekly_reset_at, monthly_reset_at: u?.monthly_reset_at,
    };
  });

  const calcResults = calculatePriorities(algoInputs, config);
  const syncResults = [];

  for (const r of calcResults) {
    const a = accs.find(x => x.id === r.account_id);
    if (!a) continue;
    try {
      await updateChannel(a.new_api_channel_id, { priority: r.priority, weight: r.weight });
      addSyncLog(a.id, 'priority', 'success', `优先级 ${r.priority}, 权重 ${r.weight} 同步成功`);
      syncResults.push({ ...r, status: 'success' });
    } catch (err) {
      addSyncLog(a.id, 'priority', 'error', `同步失败: ${err.message}`);
      syncResults.push({ ...r, status: 'error', error: err.message });
    }
  }
  res.json({ results: syncResults });
});

// GET /logs
router.get('/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  res.json({ logs: getSyncLogs(limit) });
});

async function runBalanceSync() {
  const accs = getAccountsWithChannel().filter(a => a.sync_balance_enabled && a.new_api_channel_id);
  if (accs.length === 0) return;
  const usageMap = {};
  getLatestUsage().forEach(u => { usageMap[u.id] = u; });
  for (const a of accs) {
    try {
      const u = usageMap[a.id];
      const balance = u ? Math.round((60 * (1 - (u.monthly_pct ?? 0) / 100) + (u.reward_unused ?? 0) * ((u.reward_amount_cents ?? 500) / 100)) * 100) / 100 : 0;
      await updateChannelBalance(a.new_api_channel_id, balance);
      addSyncLog(a.id, 'balance', 'success', `余额 ${balance} 自动同步`);
    } catch (err) {
      addSyncLog(a.id, 'balance', 'error', `自动同步失败: ${err.message}`);
    }
  }
}

async function runPrioritySync() {
  const config = getAlgorithmConfig();
  if (!config) return;
  const accs = getAccountsWithChannel().filter(a => a.sync_priority_enabled && a.new_api_channel_id);
  if (accs.length === 0) return;
  const usageMap = {};
  getLatestUsage().forEach(u => { usageMap[u.id] = u; });
  const algoInputs = accs.map(a => {
    const u = usageMap[a.id];
    return {
      account_id: a.id, name: a.name,
      rolling_pct: u?.rolling_pct ?? 0, weekly_pct: u?.weekly_pct ?? 0, monthly_pct: u?.monthly_pct ?? 0,
      rolling_reset_at: u?.rolling_reset_at, weekly_reset_at: u?.weekly_reset_at, monthly_reset_at: u?.monthly_reset_at,
    };
  });
  const results = calculatePriorities(algoInputs, config);
  for (const r of results) {
    const a = accs.find(x => x.id === r.account_id);
    if (!a) continue;
    try {
      await updateChannel(a.new_api_channel_id, { priority: r.priority, weight: r.weight });
      addSyncLog(a.id, 'priority', 'success', `优先级 ${r.priority}, 权重 ${r.weight} 自动同步`);
    } catch (err) {
      addSyncLog(a.id, 'priority', 'error', `自动同步失败: ${err.message}`);
    }
  }
}

module.exports = { router, runBalanceSync, runPrioritySync };
