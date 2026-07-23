require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./db');
const { pollAll } = require('./routes/usage');
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
  pollAll();
  setInterval(pollAll, POLL_INTERVAL);
  app.listen(PORT, () => log.info(`Server running on http://localhost:${PORT}`));
})();