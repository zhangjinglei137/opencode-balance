import axios from 'axios'

const api = axios.create({
  baseURL: '',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export function login(password) {
  return api.post('/api/auth/login', { password })
}

export function checkAuth() {
  return api.get('/api/auth/check')
}

export function getAccounts() {
  return api.get('/api/accounts')
}

export function getAccount(id) {
  return api.get(`/api/accounts/${id}`)
}

export function createAccount(data) {
  return api.post('/api/accounts', data)
}

export function updateAccount(id, data) {
  return api.put(`/api/accounts/${id}`, data)
}

export function deleteAccount(id) {
  return api.delete(`/api/accounts/${id}`)
}

export function reorderAccounts(ids) {
  return api.put('/api/accounts/reorder', { ids })
}

export function getUsage() {
  return api.get('/api/usage')
}

export function fetchUsage() {
  return api.post('/api/usage/fetch')
}

export function applyReward(accountId, referralId) {
  return api.post('/api/usage/rewards/apply', { accountId, referralId })
}

// 渠道控制
export function getChannelStatus() { return api.get('/api/channels'); }
export function syncBalance(channelId) { return api.post('/api/channels/sync-balance', { channel_id: channelId }); }
export function syncPriority(channelId) { return api.post('/api/channels/sync-priority', { channel_id: channelId }); }
export function getSyncLogs(limit = 50) { return api.get('/api/channels/logs', { params: { limit } }); }

// 算法配置
export function getAlgorithmConfig() { return api.get('/api/algorithm/config'); }
export function updateAlgorithmConfig(data) { return api.put('/api/algorithm/config', data); }
export function simulateAlgorithm(data) { return api.post('/api/algorithm/simulate', data); }

export default api
