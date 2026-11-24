import { useI18n } from '../i18n/context'
import type { Lang } from '../i18n/messages'

const LANGS: { value: Lang; label: string; name: string }[] = [
  { value: 'id', label: 'ID', name: 'Bahasa Indonesia' },
  { value: 'en', label: 'EN', name: 'English' },
]

export function LangSwitch() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="segmented lang-switch" role="group" aria-label={t.langName}>
      {LANGS.map((l) => (
        <button
          key={l.value}
          type="button"
          lang={l.value}
          aria-label={l.name}
          aria-pressed={lang === l.value}
          onClick={() => setLang(l.value)}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
