import client from './client'
import type { AuthResponse, LoginPayload, RegisterPayload } from 'src/types/auth'

export function registerAccount(payload: RegisterPayload) {
  return client.post<AuthResponse>('/auth/register', payload)
}

export function loginAccount(payload: LoginPayload) {
  return client.post<AuthResponse>('/auth/login', payload)
}

export function fetchCurrentUser() {
  return client.get<AuthResponse>('/auth/me')
}

export function logoutAccount() {
  return client.post<{ ok: boolean }>('/auth/logout')
}
