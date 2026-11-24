import { createContext, useContext } from 'react'
import type { User } from '../lib/auth/localAuth'

export interface AuthValue {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
