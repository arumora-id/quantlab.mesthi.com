/** Local weekday (0 = Sunday) and minute of day in a time zone, following daylight saving time. */
export type LocalClock = (unixSeconds: number) => { weekday: number; minute: number }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Cached per UTC hour: the zones used here (New York, London) change offset only on whole hours,
 * so the local minute is the local hour plus the UTC minute.
 */
export function localClock(timeZone: string): LocalClock {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  })
  const cache = new Map<number, { weekday: number; hour: number }>()
  return (t) => {
    const hourKey = Math.floor(t / 3600)
    let h = cache.get(hourKey)
    if (!h) {
      const parts = fmt.formatToParts(new Date(hourKey * 3600 * 1000))
      h = {
        weekday: WEEKDAYS.indexOf(parts.find((p) => p.type === 'weekday')!.value),
        hour: Number(parts.find((p) => p.type === 'hour')!.value),
      }
      cache.set(hourKey, h)
    }
    return { weekday: h.weekday, minute: h.hour * 60 + Math.floor((t % 3600) / 60) }
  }
}

export interface SessionWindow {
  timeZone: string
  /** Local minutes of day, [start, end). */
  start: number
  end: number
}

export const NEW_YORK_OPEN: SessionWindow = { timeZone: 'America/New_York', start: 9 * 60 + 30, end: 11 * 60 + 30 }
export const LONDON_OPEN: SessionWindow = { timeZone: 'Europe/London', start: 8 * 60, end: 10 * 60 }

/** For each candle (opening at `time`, lasting `step` seconds): inside the window on Mon-Fri, and whether it is the window's last candle. */
export function sessionMask(times: number[], step: number, w: SessionWindow) {
  const clock = localClock(w.timeZone)
  const inside = times.map((t) => {
    const { weekday, minute } = clock(t)
    return weekday >= 1 && weekday <= 5 && minute >= w.start && minute < w.end
  })
  const last = inside.map((v, i) => v && (i + 1 >= times.length || !inside[i + 1] || times[i + 1] - times[i] > step))
  return { inside, last }
}
