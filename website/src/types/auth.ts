export interface AuthUser {
  id: string
  name: string
  email: string
}

export interface AuthResponse {
  user: AuthUser
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
}

export interface LoginPayload {
  email: string
  password: string
}
