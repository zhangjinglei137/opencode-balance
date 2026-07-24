const NEW_API_URL = process.env.NEW_API_URL || 'http://localhost:3000';
const NEW_API_TOKEN = process.env.NEW_API_TOKEN || '';
const NEW_API_USER_ID = process.env.NEW_API_USER_ID || '1';

async function updateChannel(channelId, data) {
  const url = `${NEW_API_URL}/api/channel/`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${NEW_API_TOKEN}`,
      'New-Api-User': NEW_API_USER_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: channelId, ...data }),
  });
  if (!resp.ok) throw new Error(`New API ${resp.status}: ${await resp.text()}`);
  return { ok: true };
}

async function getChannel(channelId) {
  const url = `${NEW_API_URL}/api/channel/${channelId}`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${NEW_API_TOKEN}`, 'New-Api-User': NEW_API_USER_ID },
  });
  if (!resp.ok) throw new Error(`New API ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

module.exports = { updateChannel, getChannel };
