const { Router } = require('express');
const jwt = require('jsonwebtoken');

const router = Router();

const APP_PASSWORD = process.env.APP_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== APP_PASSWORD) {
    return res.status(401).json({ error: '密码错误' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

router.get('/check', (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.json({ loggedIn: false });
  }
  try {
    jwt.verify(header.slice(7), JWT_SECRET);
    res.json({ loggedIn: true });
  } catch {
    res.json({ loggedIn: false });
  }
});

module.exports = router;