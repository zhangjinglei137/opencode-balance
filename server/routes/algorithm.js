const { Router } = require('express');
const auth = require('../middleware/auth');
const { getAlgorithmConfig, updateAlgorithmConfig } = require('../db');
const { calculatePriorities, normalizeUsage } = require('../algorithm');
const { getLatestUsage, getAccountsWithChannel } = require('../db');

const router = Router();
router.use(auth);

// GET /config — 获取算法配置
router.get('/config', (req, res) => {
  const config = getAlgorithmConfig();
  if (!config) return res.status(404).json({ error: '算法配置不存在' });
  res.json(config);
});

// PUT /config — 更新算法配置
router.put('/config', (req, res) => {
  updateAlgorithmConfig(req.body);
  res.json({ ok: true });
});

// POST /simulate — 模拟运行
router.post('/simulate', (req, res) => {
  const config = req.body.config_overrides
    ? Object.assign(getAlgorithmConfig() || {}, req.body.config_overrides)
    : getAlgorithmConfig();
  if (!config) return res.status(400).json({ error: '算法配置不存在' });

  let inputs;
  if (req.body.manual_inputs) {
    inputs = (req.body.manual_inputs || []).map(i => ({ account_id: i.account_id, name: i.name, ...normalizeUsage(i) }));
  } else {
    const accs = getAccountsWithChannel().filter(a => a.new_api_channel_id);
    const usageMap = {};
    getLatestUsage().forEach(u => { usageMap[u.id] = u; });
    inputs = accs.map(a => ({ account_id: a.id, name: a.name, ...normalizeUsage(usageMap[a.id] || {}) }));
  }

  const results = calculatePriorities(inputs, config);
  res.json({ results, config_used: config });
});

module.exports = router;
