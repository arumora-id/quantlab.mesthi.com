import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useI18n } from '../i18n/context'

/** Shown first; only those Binance still lists are kept once the full list arrives. */
const POPULAR = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'LINKUSDT', 'AVAXUSDT', 'SUIUSDT']

interface Props {
  value: string
  /** Full USDT-M perpetual list; null while loading, [] when it failed. */
  symbols: string[] | null
  onPick: (symbol: string) => void
  labelId: string
}

interface Item {
  symbol: string
  section: 'popular' | 'all'
}

/** Pick-from-list combobox: a button opens a listbox with an optional filter field. */
export function PairPicker({ value, symbols, onPick, labelId }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const listId = useId()

  const items = useMemo<Item[]>(() => {
    const all = symbols ?? []
    const known = new Set(all)
    const popular = all.length ? POPULAR.filter((s) => known.has(s)) : POPULAR
    const q = query.trim().toUpperCase()
    const match = (s: string) => !q || s.includes(q)
    return [
      ...popular.filter(match).map((symbol) => ({ symbol, section: 'popular' as const })),
      ...all.filter((s) => match(s) && !popular.includes(s)).map((symbol) => ({ symbol, section: 'all' as const })),
    ]
  }, [symbols, query])

  const popularCount = items.filter((i) => i.section === 'popular').length

  // close on outside click
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // focus the filter and highlight the current pair when opening
  useEffect(() => {
    if (!open) return
    search.current?.focus()
  }, [open])

  // keep the highlighted option in view
  useEffect(() => {
    if (!open) return
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open, listId])

  const openList = () => {
    setQuery('')
    const idx = items.findIndex((i) => i.symbol === value)
    setActive(Math.max(0, idx))
    setOpen(true)
  }

  const choose = (symbol: string) => {
    setOpen(false)
    button.current?.focus()
    if (symbol !== value) onPick(symbol)
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(items.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(items.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[active]) choose(items[active].symbol)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      button.current?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const base = (s: string) => s.replace(/USDT$/, '')

  return (
    <div className="pair-picker" ref={root}>
      <button
        ref={button}
        type="button"
        className="input pair-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${listId}-value`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            openList()
          }
        }}
      >
        <span id={`${listId}-value`}>
          <strong>{base(value)}</strong>
          <span className="muted">USDT · PERP</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="pair-pop card">
          <input
            ref={search}
            className="input"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
            aria-label={t.data.search}
            placeholder={t.data.search}
            value={query}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKey}
          />
          {symbols !== null && symbols.length === 0 && <p className="pair-note">{t.data.listFailed}</p>}
          <ul id={listId} role="listbox" aria-label={t.data.choosePair} className="pair-list">
            {items.length === 0 && <li className="pair-note">{t.data.noMatch}</li>}
            {items.map((item, i) => (
              <li key={item.symbol} role="presentation">
                {(i === 0 || i === popularCount) && (
                  <div className="pair-section" aria-hidden="true">
                    {item.section === 'popular' ? t.data.popular : t.data.all(symbols?.length ?? 0)}
                  </div>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={item.symbol === value}
                  className={`pair-option${i === active ? ' active' : ''}`}
                  onPointerMove={() => setActive(i)}
                  onClick={() => choose(item.symbol)}
                >
                  <strong>{base(item.symbol)}</strong>
                  <span className="muted">USDT</span>
                  {item.symbol === value && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
