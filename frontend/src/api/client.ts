import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
})

// Types
export interface Entry {
  id: string
  title: string
  username: string | null
  password: string
  url: string | null
  notes: string | null
  category_id: string | null
  category_name: string | null
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  created_at: string
}

export interface GenerateRequest {
  length: number
  uppercase: boolean
  lowercase: boolean
  digits: boolean
  symbols: boolean
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: number
}

export interface TouchIdStatus {
  registered: boolean
  keychain_available: boolean
}

export interface WebAuthnLoginResult {
  message: string
  email: string
  requires_password: boolean
}

// API methods
export const authApi = {
  me: () => api.get<{ email: string; unlocked: boolean }>('/auth/me'),
  unlock: (master_password?: string) =>
    api.post('/auth/unlock', { master_password: master_password || null }),
  setupMasterPassword: (password: string) =>
    api.post('/auth/setup-master-password', { master_password: password }),
  logout: () => api.post('/auth/logout'),
  loginWithGoogle: () => { window.location.href = `${API_BASE}/auth/google` },
  // Touch ID / WebAuthn
  touchIdStatus: () => api.get<TouchIdStatus>('/auth/touchid-status'),
  webAuthnRegisterOptions: () => api.get<{ options: object }>('/auth/webauthn/register-options'),
  webAuthnRegister: (credential: object) => api.post('/auth/webauthn/register', { credential }),
  webAuthnLoginOptions: () => api.post<{ options: object }>('/auth/webauthn/login-options', {}),
  webAuthnLogin: (credential: object) =>
    api.post<WebAuthnLoginResult>('/auth/webauthn/login', { credential }),
}

export const entriesApi = {
  list: (search?: string, category_id?: string) =>
    api.get<Entry[]>('/api/entries', { params: { search, category_id } }),
  get: (id: string) => api.get<Entry>(`/api/entries/${id}`),
  create: (data: Partial<Entry> & { password: string }) =>
    api.post<Entry>('/api/entries', data),
  update: (id: string, data: Partial<Entry>) =>
    api.put<Entry>(`/api/entries/${id}`, data),
  delete: (id: string) => api.delete(`/api/entries/${id}`),
}

export const categoriesApi = {
  list: () => api.get<Category[]>('/api/categories'),
  create: (name: string) => api.post<Category>('/api/categories', { name }),
  update: (id: string, name: string) => api.put<Category>(`/api/categories/${id}`, { name }),
  delete: (id: string) => api.delete(`/api/categories/${id}`),
}

export const generatorApi = {
  generate: (req: GenerateRequest) =>
    api.post<{ password: string }>('/api/generate', req),
}

export const vaultApi = {
  exportJson: () => api.get('/api/export?format=json', { responseType: 'blob' }),
  exportCsv: () => api.get('/api/export?format=csv', { responseType: 'blob' }),
  import: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<ImportResult>('/api/import', form)
  },
}

export const extensionApi = {
  downloadUrl: () => `${API_BASE}/api/extension/download`,
}
