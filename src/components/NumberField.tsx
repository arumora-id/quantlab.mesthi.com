import { useState } from 'react'
import { useI18n } from '../i18n/context'

interface Props {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  label?: string
}

/**
 * Number input that keeps the user's draft text and only commits values inside [min, max],
 * so typing "100" into a min-5 field is not clamped at the first keystroke.
 */
export function NumberField({ value, onChange, min, max, step, label }: Props) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<string | null>(null)
  const valid = (n: number) => Number.isFinite(n) && n >= min && n <= max
  const invalid = draft !== null && !valid(Number(draft))
  return (
    <input
      className="input num"
      type="number"
      inputMode="decimal"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={draft ?? value}
      aria-invalid={invalid || undefined}
      title={invalid ? t.common.invalidRange(min, max) : undefined}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value !== '' && valid(n)) onChange(n)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}
