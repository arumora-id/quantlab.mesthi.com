import type { Setup } from './backtest/rules'

const key = (email: string) => `quantlab.setups.${email}`

export function loadSetups(email: string): Setup[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(email)) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

/** Saves or replaces a setup by name. */
export function saveSetup(email: string, setup: Setup): Setup[] {
  const next = [...loadSetups(email).filter((s) => s.name !== setup.name), structuredClone(setup)]
  localStorage.setItem(key(email), JSON.stringify(next))
  return next
}

export function deleteSetup(email: string, name: string): Setup[] {
  const next = loadSetups(email).filter((s) => s.name !== name)
  localStorage.setItem(key(email), JSON.stringify(next))
  return next
}
