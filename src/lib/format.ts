export const pct = (v: number, digits = 2) =>
  Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%` : '—'

export const plainPct = (v: number, digits = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(digits)}%` : '—')

export const fixed = (v: number, digits = 2) =>
  v === Infinity ? '∞' : Number.isFinite(v) ? v.toFixed(digits) : '—'

export const money = (v: number, locale = 'id-ID') =>
  Number.isFinite(v) ? v.toLocaleString(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '—'

export const price = (v: number) =>
  Number.isFinite(v)
    ? v.toLocaleString('en-US', { maximumSignificantDigits: v >= 1 ? 8 : 5, useGrouping: false })
    : '—'

export const date = (unixSeconds: number, locale = 'id-ID') =>
  new Date(unixSeconds * 1000).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC'

export const day = (unixSeconds: number, locale = 'id-ID') =>
  new Date(unixSeconds * 1000).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })

export const tone = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : '')
