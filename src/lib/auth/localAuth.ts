/**
 * Browser-only accounts for the first stage: users live in localStorage, passwords are
 * stored as salted PBKDF2-SHA256 hashes. This is NOT server authentication: anyone with
 * access to the browser can read or clear the data. Replace with a backend before real use.
 */

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface User {
  name: string
  email: string
}

interface StoredUser extends User {
  salt: string
  hash: string
}

const USERS_KEY = 'quantlab.users'
const SESSION_KEY = 'quantlab.session'
const ITERATIONS = 150_000

export class AuthError extends Error {
  readonly field?: 'name' | 'email' | 'password'
  constructor(message: string, field?: 'name' | 'email' | 'password') {
    super(message)
    this.field = field
  }
}

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hashPassword(password: string, saltHex: string) {
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    key,
    256,
  )
  return toHex(bits)
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function createLocalAuth(store: KeyValueStore) {
  const readUsers = (): StoredUser[] => {
    try {
      return JSON.parse(store.getItem(USERS_KEY) ?? '[]')
    } catch {
      return []
    }
  }

  return {
    async register(name: string, email: string, password: string): Promise<User> {
      const cleanName = name.trim()
      const cleanEmail = normalizeEmail(email)
      if (!cleanName) throw new AuthError('Nama wajib diisi.', 'name')
      if (!EMAIL_RE.test(cleanEmail)) throw new AuthError('Format email tidak valid.', 'email')
      if (password.length < 8) throw new AuthError('Password minimal 8 karakter.', 'password')
      const users = readUsers()
      if (users.some((u) => u.email === cleanEmail))
        throw new AuthError('Email sudah terdaftar. Silakan login.', 'email')
      const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
      const hash = await hashPassword(password, salt)
      store.setItem(USERS_KEY, JSON.stringify([...users, { name: cleanName, email: cleanEmail, salt, hash }]))
      store.setItem(SESSION_KEY, cleanEmail)
      return { name: cleanName, email: cleanEmail }
    },

    async login(email: string, password: string): Promise<User> {
      const cleanEmail = normalizeEmail(email)
      const user = readUsers().find((u) => u.email === cleanEmail)
      // same message for unknown email and wrong password
      const fail = new AuthError('Email atau password salah.', 'password')
      if (!user) throw fail
      if ((await hashPassword(password, user.salt)) !== user.hash) throw fail
      store.setItem(SESSION_KEY, cleanEmail)
      return { name: user.name, email: user.email }
    },

    logout() {
      store.removeItem(SESSION_KEY)
    },

    currentUser(): User | null {
      const email = store.getItem(SESSION_KEY)
      const user = email ? readUsers().find((u) => u.email === email) : undefined
      return user ? { name: user.name, email: user.email } : null
    },
  }
}

export type LocalAuth = ReturnType<typeof createLocalAuth>
