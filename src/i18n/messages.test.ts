import { describe, expect, it } from 'vitest'
import { INDICATORS } from '../lib/backtest/catalog'
import { EN_NOTES, EN_PARAM_LABELS, MESSAGES } from './messages'

/** Labels in catalog.ts that are already English and need no translation. */
const looksEnglish = (label: string) => !/(Panjang|Sumber|Faktor|Lebar|Tunggu|bar\)|naik|turun|risiko|Kehalusan|Rasio|Faktor|Memori|Klaster|Maks|Panjang)/.test(label)

describe('translations', () => {
  it('every indicator note has an English version', () => {
    const missing = INDICATORS.filter((d) => d.note && !EN_NOTES[d.id]).map((d) => d.id)
    expect(missing).toEqual([])
  })

  it('every Indonesian parameter label has an English version', () => {
    const labels = new Set(INDICATORS.flatMap((d) => d.params.map((p) => p.label)))
    const missing = [...labels].filter((l) => !looksEnglish(l) && !EN_PARAM_LABELS[l])
    expect(missing).toEqual([])
  })

  it('translates catalog text in EN and keeps it in ID', () => {
    expect(MESSAGES.en.catalog.param('Panjang')).toBe('Length')
    expect(MESSAGES.id.catalog.param('Panjang')).toBe('Panjang')
    expect(MESSAGES.en.catalog.category('Likuiditas')).toBe('Liquidity')
    expect(MESSAGES.en.auth.errors.badCredentials).toBe('Wrong email or password.')
  })
})
