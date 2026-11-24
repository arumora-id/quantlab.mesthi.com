import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalAuth, type KeyValueStore } from './localAuth'

function memoryStore(): KeyValueStore & { dump: () => string } {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => [...m.values()].join('\n'),
  }
}

describe('local auth', () => {
  let store: ReturnType<typeof memoryStore>
  let auth: ReturnType<typeof createLocalAuth>
  beforeEach(() => {
    store = memoryStore()
    auth = createLocalAuth(store)
  })

  it('registers, signs in, and keeps the session', async () => {
    await auth.register('Ana', 'Ana@Example.com ', 'rahasia123')
    expect(auth.currentUser()).toEqual({ name: 'Ana', email: 'ana@example.com' })
    auth.logout()
    expect(auth.currentUser()).toBeNull()
    await expect(auth.login('ana@example.com', 'rahasia123')).resolves.toMatchObject({ name: 'Ana' })
    expect(auth.currentUser()?.email).toBe('ana@example.com')
  })

  it('never stores the plain password', async () => {
    await auth.register('Ana', 'ana@example.com', 'rahasia123')
    expect(store.dump()).not.toContain('rahasia123')
  })

  it('rejects a wrong password and an unknown email with the same message', async () => {
    await auth.register('Ana', 'ana@example.com', 'rahasia123')
    auth.logout()
    const wrong = await auth.login('ana@example.com', 'salah12345').catch((e) => e.code)
    const unknown = await auth.login('budi@example.com', 'rahasia123').catch((e) => e.code)
    expect(wrong).toBe('badCredentials')
    expect(unknown).toBe(wrong)
    expect(auth.currentUser()).toBeNull()
  })

  it('rejects duplicate emails and weak input with the offending field', async () => {
    await auth.register('Ana', 'ana@example.com', 'rahasia123')
    await expect(auth.register('Ana 2', 'ANA@example.com', 'rahasia123')).rejects.toMatchObject({ code: 'emailTaken', field: 'email' })
    await expect(auth.register('Budi', 'budi@example', 'rahasia123')).rejects.toMatchObject({ code: 'emailInvalid', field: 'email' })
    await expect(auth.register('Budi', 'budi@example.com', 'pendek')).rejects.toMatchObject({ code: 'passwordShort', field: 'password' })
    await expect(auth.register('  ', 'budi@example.com', 'rahasia123')).rejects.toMatchObject({ code: 'nameRequired', field: 'name' })
  })
})
