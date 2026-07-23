const { Router } = require('express');
const auth = require('../middleware/auth');
const { getAccounts, getAccount, createAccount, updateAccount, deleteAccount, reorderAccounts } = require('../db');

const router = Router();
router.use(auth);

router.get('/', (req, res) => {
  res.json(getAccounts());
});

router.put('/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids 必须是数组' });
  reorderAccounts(ids);
  res.json({ ok: true });
});

router.get('/:id', (req, res) => {
  const account = getAccount(Number(req.params.id));
  if (!account) return res.status(404).json({ error: '账号不存在' });
  res.json(account);
});

router.post('/', (req, res) => {
  const { name, workspaceId, authCookie } = req.body;
  if (!name || !workspaceId || !authCookie) {
    return res.status(400).json({ error: '缺少必填字段：name, workspaceId, authCookie' });
  }
  const result = createAccount(name, workspaceId, authCookie);
  res.status(201).json({ id: result.id });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getAccount(id)) return res.status(404).json({ error: '账号不存在' });
  const { name, workspaceId, authCookie } = req.body;
  updateAccount(id, name, workspaceId, authCookie || undefined);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getAccount(id)) return res.status(404).json({ error: '账号不存在' });
  deleteAccount(id);
  res.json({ ok: true });
});

module.exports = router;