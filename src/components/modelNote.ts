import type { Messages } from '../i18n/messages'
import type { SetupModel } from '../lib/backtest/rules'

/** Explains which global settings a built-in model ignores. */
export function modelNote(t: Messages, model: SetupModel) {
  return model.kind === 'fabioProxy' ? t.simple.modelNoteFabio(model.riskPct) : t.simple.modelNote(model.targetVol)
}
