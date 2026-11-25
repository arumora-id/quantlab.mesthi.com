import type { Messages } from '../i18n/messages'
import type { SetupModel } from '../lib/backtest/rules'

/** Explains which global settings a built-in model ignores. */
export function modelNote(t: Messages, model: SetupModel) {
  if (model.kind === 'fabioProxy') return t.simple.modelNoteFabio(model.riskPct)
  if (model.kind === 'fibSniper') return t.simple.modelNoteFib(model.riskPct)
  return t.simple.modelNote(model.targetVol)
}
