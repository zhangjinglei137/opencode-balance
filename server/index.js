require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { initDb, getAlgorithmConfig } = require('./db');
const { pollAll } = require('./routes/usage');
const { runBalanceSync, runPrioritySync } = require('./routes/channels');
const log = require('./logger');

const app = express();
const PORT = Number(process.env.PORT) || 3456;
const POLL_INTERVAL = (Number(process.env.POLL_INTERVAL_MINUTES) || 5) * 60 * 1000;

app.use(express.json());

// 静态文件：生产环境优先使用 client/dist，开发环境回退 public/
const distDir = path.join(__dirname, '..', 'client', 'dist');
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  log.info('静态文件: client/dist');
} else {
  app.use(express.static(publicDir));
}

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/usage', require('./routes/usage').router);
app.use('/api/channels', require('./routes/channels').router);
app.use('/api/algorithm', require('./routes/algorithm'));

// SPA 回退：前端路由由 Vue Router 处理
if (fs.existsSync(distDir)) {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// 异步启动
(async () => {
  await initDb();
  log.info('数据库初始化完成');
  // P0-1: 抓取完成后立即触发优先级同步（内部有值未变化跳过逻辑），30 分钟定时器保留作兜底
  const pollAndSync = () => pollAll().then(() => runPrioritySync().catch(err => log.error(`抓取后优先级同步失败: ${err.message}`)));
  pollAndSync();
  setInterval(pollAndSync, POLL_INTERVAL);
  app.listen(PORT, () => log.info(`Server v${require('../package.json').version} running on http://localhost:${PORT}`));

  // New API 同步定时器
  const cfg = getAlgorithmConfig() || {};
  const balanceInterval = ((cfg.sync_balance_interval_minutes) || 10) * 60 * 1000;
  const priorityInterval = ((cfg.sync_priority_interval_minutes) || 30) * 60 * 1000;

  setTimeout(() => {
    runBalanceSync().catch(err => log.error(`余额自动同步失败: ${err.message}`));
    setInterval(() => runBalanceSync().catch(err => log.error(`余额自动同步失败: ${err.message}`)), balanceInterval);
  }, 30000);

  setTimeout(() => {
    runPrioritySync().catch(err => log.error(`优先级自动同步失败: ${err.message}`));
    setInterval(() => runPrioritySync().catch(err => log.error(`优先级自动同步失败: ${err.message}`)), priorityInterval);
  }, 30000);

  log.info(`同步定时器: 余额 ${balanceInterval/60000}min, 优先级 ${priorityInterval/60000}min`);
})();