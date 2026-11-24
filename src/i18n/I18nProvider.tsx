import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, initialLang, LANG_KEY } from './context'
import { MESSAGES, type Lang } from './messages'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang)

  useEffect(() => {
    document.documentElement.lang = lang
    localStorage.setItem(LANG_KEY, lang)
  }, [lang])

  const value = useMemo(() => ({ lang, setLang, t: MESSAGES[lang] }), [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
