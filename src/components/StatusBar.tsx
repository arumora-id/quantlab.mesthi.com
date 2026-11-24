/** Loading line shown above results: a determinate bar when progress is known, else an animated one. */
export function StatusBar({ text, progress }: { text: string; progress?: number | null }) {
  const known = progress !== undefined && progress !== null
  return (
    <div className="status-bar card" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="status-text">{text}</span>
      <div
        className={`status-track${known ? '' : ' indeterminate'}`}
        role="progressbar"
        aria-label={text}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? Math.round(progress * 100) : undefined}
      >
        <div className="status-fill" style={known ? { width: `${Math.max(2, progress * 100)}%` } : undefined} />
      </div>
    </div>
  )
}
