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

export default api
