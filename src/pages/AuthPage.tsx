import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { prefersReducedMotion } from '../lib/motion'
import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { Icon } from '../components/Icon'
import { AuthError } from '../lib/auth/localAuth'
import { INDICATORS } from '../lib/backtest/catalog'

gsap.registerPlugin(useGSAP)

type Mode = 'login' | 'register'
type FieldErrors = Partial<Record<'name' | 'email' | 'password' | 'form', string>>

/** Decorative candles for the hero (deterministic so the layout never jumps). */
function useHeroCandles(count = 32) {
  return useMemo(() => {
    const out: { i: number; open: number; close: number; high: number; low: number }[] = []
    const state = { price: 50, seed: 7 }
    const rand = () => {
      state.seed = (state.seed * 16807) % 2147483647
      return state.seed / 2147483647
    }
    for (let i = 0; i < count; i++) {
      const open = state.price
      const close = open + (rand() - 0.42) * 9
      out.push({ i, open, close, high: Math.max(open, close) + rand() * 4, low: Math.min(open, close) - rand() * 4 })
      state.price = close
    }
    return out
  }, [count])
}

export default function AuthPage({ mode }: { mode: Mode }) {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const root = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const ids = { name: useId(), email: useId(), password: useId() }
  const candles = useHeroCandles()

  const isRegister = mode === 'register'
  const { min, max } = useMemo(
    () => ({ min: Math.min(...candles.map((c) => c.low)), max: Math.max(...candles.map((c) => c.high)) }),
    [candles],
  )
  const y = (v: number) => 380 - ((v - min) / (max - min)) * 340
  const step = 1000 / candles.length
  const linePoints = candles.map((c) => `${c.i * step + step / 2},${y(c.close)}`).join(' ')

  // intro choreography, once
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(
        { motion: '(prefers-reduced-motion: no-preference)', reduce: '(prefers-reduced-motion: reduce)' },
        (ctx) => {
          if (ctx.conditions?.reduce) return
          const line = root.current!.querySelector<SVGPolylineElement>('.equity-line')!
          const length = line.getTotalLength()
          const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
          tl.from('.candle', {
            scaleY: 0,
            transformOrigin: '50% 50%',
            opacity: 0,
            duration: 0.5,
            stagger: { each: 0.025, from: 'start' },
          })
            .fromTo(
              line,
              { strokeDasharray: length, strokeDashoffset: length },
              { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' },
              0.2,
            )
            .from('.auth-pitch > *', { y: 24, opacity: 0, duration: 0.6, stagger: 0.08 }, 0.1)
            .from('.auth-stats > div', { y: 16, opacity: 0, duration: 0.5, stagger: 0.06 }, 0.5)
            .from(card.current, { y: 32, opacity: 0, scale: 0.97, duration: 0.7 }, 0.15)
          gsap.to('.scan', { x: 1000, duration: 6, ease: 'none', repeat: -1 })
          gsap.to('.candle.live', { opacity: 0.45, duration: 0.8, yoyo: true, repeat: -1, ease: 'sine.inOut' })
        },
      )
    },
    { scope: root },
  )

  // tab indicator + field stagger on every mode switch
  useGSAP(
    () => {
      const reduce = prefersReducedMotion()
      gsap.to('.auth-tabs .indicator', {
        xPercent: isRegister ? 100 : 0,
        duration: reduce ? 0 : 0.45,
        ease: 'power3.inOut',
      })
      if (!reduce)
        gsap.from('.auth-card form > *, .auth-card h2, .auth-card .lead', {
          y: 12,
          opacity: 0,
          duration: 0.4,
          stagger: 0.05,
          ease: 'power2.out',
        })
    },
    { scope: root, dependencies: [mode] },
  )

  const shake = () => {
    if (prefersReducedMotion()) return
    gsap.to(card.current, { keyframes: { x: [0, -10, 10, -6, 6, 0] }, duration: 0.45, ease: 'none' })
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const email = String(data.get('email') ?? '')
    const password = String(data.get('password') ?? '')
    setErrors({})
    setBusy(true)
    try {
      if (isRegister) await register(String(data.get('name') ?? ''), email, password)
      else await login(email, password)
      navigate('/app', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan.'
      setErrors(err instanceof AuthError && err.field ? { [err.field]: msg } : { form: msg })
      shake()
    } finally {
      setBusy(false)
    }
  }

  const errorProps = (field: 'name' | 'email' | 'password', id: string) =>
    errors[field] ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-err` } : {}

  return (
    <div className="auth" ref={root}>
      <section className="auth-visual">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="chart" size={18} />
          </span>
          QuantLab
        </div>

        <svg className="market" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="scanGrad" x1="0" x2="1">
              <stop offset="0" stopColor="#22c55e" stopOpacity="0" />
              <stop offset="1" stopColor="#22c55e" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          {[80, 160, 240, 320].map((gy) => (
            <line key={gy} x1="0" x2="1000" y1={gy} y2={gy} stroke="#1e293b" strokeDasharray="4 6" />
          ))}
          {candles.map((c) => {
            const up = c.close >= c.open
            const x = c.i * step + step / 2
            return (
              <g key={c.i} className={`candle${c.i === candles.length - 1 ? ' live' : ''}`}>
                <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={up ? '#22c55e' : '#ef4444'} strokeWidth="2" />
                <rect
                  x={x - step * 0.3}
                  width={step * 0.6}
                  y={y(Math.max(c.open, c.close))}
                  height={Math.max(2, Math.abs(y(c.open) - y(c.close)))}
                  rx="2"
                  fill={up ? '#22c55e' : '#ef4444'}
                  opacity="0.85"
                />
              </g>
            )
          })}
          <polyline className="equity-line" points={linePoints} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
          <rect className="scan" x="-120" y="0" width="120" height="400" fill="url(#scanGrad)" />
        </svg>

        <div className="auth-pitch">
          <h1>Uji strategi harian sebelum mempertaruhkan modal.</h1>
          <p>
            Backtest Binance Futures USDT-M dengan indikator yang bisa digabung, order flow, dan liquidity sweep —
            tanpa look-ahead, dengan fee, slippage, dan leverage.
          </p>
        </div>
        <div className="auth-stats">
          <div>
            <strong className="num">{INDICATORS.length}</strong>
            <span className="muted">indikator</span>
          </div>
          <div>
            <strong className="num">USDT-M</strong>
            <span className="muted">semua pair perpetual</span>
          </div>
          <div>
            <strong className="num">OOS</strong>
            <span className="muted">uji out-of-sample</span>
          </div>
        </div>
      </section>

      <main className="auth-panel">
        <div className="auth-card card" ref={card}>
          <nav className="auth-tabs" aria-label="Masuk atau daftar">
            <span className="indicator" aria-hidden="true" />
            <Link to="/login" aria-current={!isRegister ? 'page' : undefined}>
              Masuk
            </Link>
            <Link to="/register" aria-current={isRegister ? 'page' : undefined}>
              Daftar
            </Link>
          </nav>

          <h2>{isRegister ? 'Buat akun' : 'Selamat datang kembali'}</h2>
          <p className="muted lead" style={{ margin: '6px 0 0' }}>
            {isRegister ? 'Mulai menyusun dan membandingkan setup.' : 'Masuk untuk melanjutkan backtest.'}
          </p>

          <form onSubmit={onSubmit} noValidate key={mode}>
            {isRegister && (
              <label className="field" htmlFor={ids.name}>
                <span>Nama</span>
                <input
                  id={ids.name}
                  name="name"
                  className="input"
                  autoComplete="name"
                  required
                  {...errorProps('name', ids.name)}
                />
                {errors.name && (
                  <small id={`${ids.name}-err`} className="field-error">
                    {errors.name}
                  </small>
                )}
              </label>
            )}
            <label className="field" htmlFor={ids.email}>
              <span>Email</span>
              <input
                id={ids.email}
                name="email"
                type="email"
                className="input"
                autoComplete="email"
                inputMode="email"
                required
                {...errorProps('email', ids.email)}
              />
              {errors.email && (
                <small id={`${ids.email}-err`} className="field-error">
                  {errors.email}
                </small>
              )}
            </label>
            <div className="field">
              <span>
                <label htmlFor={ids.password}>Password</label>
              </span>
              <div className="password-wrap">
                <input
                  id={ids.password}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  minLength={isRegister ? 8 : undefined}
                  required
                  {...errorProps('password', ids.password)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  aria-pressed={showPassword}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} />
                </button>
              </div>
              {isRegister && !errors.password && <small className="muted">Minimal 8 karakter.</small>}
              {errors.password && (
                <small id={`${ids.password}-err`} className="field-error">
                  {errors.password}
                </small>
              )}
            </div>
            {errors.form && (
              <div className="alert error" role="alert">
                {errors.form}
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {isRegister ? 'Daftar' : 'Masuk'}
            </button>
          </form>
          <p className="auth-note">
            Tahap awal: akun disimpan di browser ini saja (localStorage, password di-hash PBKDF2). Belum ada server.
          </p>
        </div>
      </main>
    </div>
  )
}
