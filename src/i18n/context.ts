import { createContext, useContext } from 'react'
import { MESSAGES, type Lang, type Messages } from './messages'

export interface I18nValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Messages
}

export const I18nContext = createContext<I18nValue>({ lang: 'id', setLang: () => {}, t: MESSAGES.id })

export const useI18n = () => useContext(I18nContext)

export const LANG_KEY = 'quantlab.lang'

/** Saved choice first, then the browser language; Indonesian browsers get ID, others EN. */
export function initialLang(): Lang {
  const saved = localStorage.getItem(LANG_KEY)
  if (saved === 'id' || saved === 'en') return saved
  return navigator.language.toLowerCase().startsWith('id') ? 'id' : 'en'
}
