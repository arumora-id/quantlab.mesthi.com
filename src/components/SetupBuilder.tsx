import { useMemo } from 'react'
import {
  defaultIndicatorParams,
  INDICATOR_BY_ID,
  INDICATORS,
  SOURCES,
  type IndicatorCategory,
} from '../lib/backtest/catalog'
import { instanceLabel, type Condition, type IndicatorInstance, type Operand, type Operator, type RuleGroup, type Setup } from '../lib/backtest/rules'
import { Icon } from './Icon'
import { NumberField } from './NumberField'

type GroupKey = 'entryLong' | 'exitLong' | 'entryShort' | 'exitShort'

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'entryLong', label: 'Entry long' },
  { key: 'exitLong', label: 'Exit long' },
  { key: 'entryShort', label: 'Entry short' },
  { key: 'exitShort', label: 'Exit short' },
]

const OPERATORS: { value: Operator; label: string }[] = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: 'crossesAbove', label: 'cross ↑' },
  { value: 'crossesBelow', label: 'cross ↓' },
]

const PRICE_FIELDS = [...SOURCES, 'volume'] as const


function encode(o: Operand) {
  if (o.kind === 'price') return `price:${o.field}`
  if (o.kind === 'indicator') return `ind:${o.instanceId}:${o.output}`
  return 'num'
}

function decode(v: string, previous: Operand): Operand {
  if (v === 'num') return { kind: 'number', value: previous.kind === 'number' ? previous.value : 0 }
  const [kind, a, b] = v.split(':')
  if (kind === 'price') return { kind: 'price', field: a as (typeof PRICE_FIELDS)[number] }
  return { kind: 'indicator', instanceId: a, output: b }
}

function OperandPicker({
  value,
  onChange,
  instances,
  label,
}: {
  value: Operand
  onChange: (o: Operand) => void
  instances: IndicatorInstance[]
  label: string
}) {
  return (
    <div className="cond-row">
      <select className="input" aria-label={label} value={encode(value)} onChange={(e) => onChange(decode(e.target.value, value))}>
        <optgroup label="Harga">
          {PRICE_FIELDS.map((f) => (
            <option key={f} value={`price:${f}`}>
              {f}
            </option>
          ))}
        </optgroup>
        {instances.map((inst) => (
          <optgroup key={inst.id} label={`${inst.id} · ${instanceLabel(inst)}`}>
            {INDICATOR_BY_ID[inst.defId]?.outputs.map((out) => (
              <option key={out} value={`ind:${inst.id}:${out}`}>
                {inst.id}.{out}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="num">angka…</option>
      </select>
      {value.kind === 'number' && (
        <input
          className="input num"
          type="number"
          step="any"
          aria-label={`${label}: angka`}
          value={value.value}
          onChange={(e) => onChange({ kind: 'number', value: Number(e.target.value) })}
        />
      )}
    </div>
  )
}

function GroupEditor({
  label,
  group,
  onChange,
  instances,
}: {
  label: string
  group: RuleGroup
  onChange: (g: RuleGroup) => void
  instances: IndicatorInstance[]
}) {
  const update = (i: number, c: Condition) =>
    onChange({ ...group, conditions: group.conditions.map((x, j) => (j === i ? c : x)) })
  const firstOutput: Operand = instances[0]
    ? { kind: 'indicator', instanceId: instances[0].id, output: INDICATOR_BY_ID[instances[0].defId].outputs[0] }
    : { kind: 'price', field: 'close' }

  return (
    <div className="rule-group">
      <header>
        <h3>{label}</h3>
        <div className="segmented" role="group" aria-label={`${label}: logika`}>
          {(['all', 'any'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={group.mode === m} onClick={() => onChange({ ...group, mode: m })}>
              {m === 'all' ? 'AND' : 'OR'}
            </button>
          ))}
        </div>
      </header>
      {group.conditions.map((c, i) => (
        <div className="cond" key={i}>
          <OperandPicker label={`${label} ${i + 1} kiri`} value={c.left} instances={instances} onChange={(left) => update(i, { ...c, left })} />
          <div className="cond-row">
            <select
              className="input"
              aria-label={`${label} ${i + 1} operator`}
              value={c.op}
              onChange={(e) => update(i, { ...c, op: e.target.value as Operator })}
            >
              {OPERATORS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label={`Hapus kondisi ${i + 1} ${label}`}
              onClick={() => onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) })}
            >
              <Icon name="trash" />
            </button>
          </div>
          <OperandPicker label={`${label} ${i + 1} kanan`} value={c.right} instances={instances} onChange={(right) => update(i, { ...c, right })} />
        </div>
      ))}
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={() =>
          onChange({
            ...group,
            conditions: [...group.conditions, { left: firstOutput, op: '>', right: { kind: 'number', value: 0 } }],
          })
        }
      >
        <Icon name="plus" /> Kondisi
      </button>
    </div>
  )
}

interface Props {
  setup: Setup
  onChange: (s: Setup) => void
  presets: Setup[]
  saved: Setup[]
  onSave: () => void
  onDelete: (name: string) => void
}

export function SetupBuilder({ setup, onChange, presets, saved, onSave, onDelete }: Props) {
  const byCategory = useMemo(() => {
    const m = new Map<IndicatorCategory, typeof INDICATORS>()
    for (const d of INDICATORS) m.set(d.category, [...(m.get(d.category) ?? []), d])
    return [...m]
  }, [])

  const addIndicator = (defId: string) => {
    const def = INDICATOR_BY_ID[defId]
    if (!def) return
    let n = 1
    while (setup.indicators.some((i) => i.id === `${defId}${n}`)) n++
    onChange({
      ...setup,
      indicators: [...setup.indicators, { id: `${defId}${n}`, defId, params: defaultIndicatorParams(def) }],
    })
  }

  const removeIndicator = (id: string) => {
    const uses = (o: Operand) => o.kind === 'indicator' && o.instanceId === id
    const strip = (g: RuleGroup) => ({ ...g, conditions: g.conditions.filter((c) => !uses(c.left) && !uses(c.right)) })
    onChange({
      ...setup,
      indicators: setup.indicators.filter((i) => i.id !== id),
      entryLong: strip(setup.entryLong),
      exitLong: strip(setup.exitLong),
      entryShort: strip(setup.entryShort),
      exitShort: strip(setup.exitShort),
    })
  }

  const setParam = (id: string, key: string, v: number) =>
    onChange({
      ...setup,
      indicators: setup.indicators.map((i) => (i.id === id ? { ...i, params: { ...i.params, [key]: v } } : i)),
    })

  const loadValue = (v: string) => {
    const [kind, idx] = v.split(':')
    const src = kind === 'preset' ? presets[+idx] : saved[+idx]
    if (src) onChange(structuredClone(src))
  }

  const isSaved = saved.some((s) => s.name === setup.name)

  return (
    <section className="card panel" aria-labelledby="setup-title">
      <div className="panel-head">
        <h2 id="setup-title">Setup strategi</h2>
      </div>
      <label className="field">
        <span>Muat preset / setup tersimpan</span>
        <select className="input" value="" onChange={(e) => loadValue(e.target.value)}>
          <option value="" disabled>
            Pilih…
          </option>
          <optgroup label="Preset">
            {presets.map((p, i) => (
              <option key={p.name} value={`preset:${i}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {saved.length > 0 && (
            <optgroup label="Tersimpan">
              {saved.map((p, i) => (
                <option key={p.name} value={`saved:${i}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <label className="field">
        <span>Nama setup</span>
        <input className="input" value={setup.name} onChange={(e) => onChange({ ...setup, name: e.target.value })} />
      </label>
      <div className="grid-2">
        <button type="button" className="btn btn-sm" onClick={onSave} disabled={!setup.name.trim()}>
          <Icon name="save" /> {isSaved ? 'Perbarui' : 'Simpan'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onDelete(setup.name)} disabled={!isSaved}>
          <Icon name="trash" /> Hapus simpanan
        </button>
      </div>

      <div className="panel-head">
        <h2>Indikator ({setup.indicators.length})</h2>
      </div>
      <select className="input" aria-label="Tambah indikator" value="" onChange={(e) => addIndicator(e.target.value)}>
        <option value="" disabled>
          + Tambah indikator…
        </option>
        {byCategory.map(([cat, defs]) => (
          <optgroup key={cat} label={cat}>
            {defs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {setup.indicators.map((inst) => {
        const def = INDICATOR_BY_ID[inst.defId]
        if (!def) return null
        return (
          <div className="ind-item" key={inst.id}>
            <header>
              <span className="tag">{inst.id}</span>
              <strong>{def.name}</strong>
              <button type="button" className="btn btn-ghost btn-icon" aria-label={`Hapus ${inst.id}`} onClick={() => removeIndicator(inst.id)}>
                <Icon name="trash" />
              </button>
            </header>
            {def.params.length > 0 && (
              <div className="ind-params">
                {def.params.map((p) => (
                  <label className="field" key={p.key}>
                    <span>{p.label}</span>
                    {p.key === 'source' ? (
                      <select
                        className="input"
                        value={inst.params[p.key] ?? 0}
                        onChange={(e) => setParam(inst.id, p.key, Number(e.target.value))}
                      >
                        {SOURCES.map((s, i) => (
                          <option key={s} value={i}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <NumberField
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        value={inst.params[p.key] ?? p.default}
                        onChange={(n) => setParam(inst.id, p.key, n)}
                      />
                    )}
                  </label>
                ))}
              </div>
            )}
            <p className="ind-note">
              Output: {def.outputs.join(', ')}
              {def.note ? ` — ${def.note}` : ''}
            </p>
          </div>
        )
      })}

      <div className="panel-head">
        <h2>Aturan</h2>
      </div>
      {GROUPS.map((g) => (
        <GroupEditor
          key={g.key}
          label={g.label}
          group={setup[g.key]}
          instances={setup.indicators}
          onChange={(group) => onChange({ ...setup, [g.key]: group })}
        />
      ))}
    </section>
  )
}
