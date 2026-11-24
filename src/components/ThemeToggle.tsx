import { useI18n } from '../i18n/context'
import { useTheme } from '../theme/context'
import { Icon } from './Icon'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { t } = useI18n()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost theme-toggle"
      onClick={() => setTheme(next)}
      aria-label={next === 'light' ? t.theme.toLight : t.theme.toDark}
      title={next === 'light' ? t.theme.toLight : t.theme.toDark}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  )
}
