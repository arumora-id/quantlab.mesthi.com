import { useMemo, useState, type ReactNode } from 'react'
import { createLocalAuth, type User } from '../lib/auth/localAuth'
import { AuthContext, type AuthValue } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useMemo(() => createLocalAuth(window.localStorage), [])
  const [user, setUser] = useState<User | null>(() => auth.currentUser())

  const value = useMemo<AuthValue>(
    () => ({
      user,
      login: async (email, password) => setUser(await auth.login(email, password)),
      register: async (name, email, password) => setUser(await auth.register(name, email, password)),
      logout: () => {
        auth.logout()
        setUser(null)
      },
    }),
    [auth, user],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
