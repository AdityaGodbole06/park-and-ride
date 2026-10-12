import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { PlanQuery } from './types'

export function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Ticks every 30s so "in 12 min" labels stay current. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable (private mode); the feature just won't persist */
  }
}

const COMMUTE_KEY = 'pr.commute'

export function useSavedCommute() {
  const [commute, setCommute] = useState<PlanQuery | null>(() => readJson<PlanQuery>(COMMUTE_KEY))
  const save = useCallback((q: PlanQuery | null) => {
    writeJson(COMMUTE_KEY, q)
    setCommute(q)
  }, [])
  return [commute, save] as const
}

const CONFIRMED_KEY = 'pr.confirmed'

export function useConfirmedSpots() {
  const [ids, setIds] = useState<string[]>(() => readJson<string[]>(CONFIRMED_KEY) ?? [])
  const add = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id]
      writeJson(CONFIRMED_KEY, next)
      return next
    })
  }, [])
  return [ids, add] as const
}

export type ThemePref = 'system' | 'light' | 'dark'
const THEME_KEY = 'pr.theme'

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => {
    try {
      const v = localStorage.getItem(THEME_KEY)
      return v === 'light' || v === 'dark' ? v : 'system'
    } catch {
      return 'system'
    }
  })
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const dark = pref === 'dark' || (pref === 'system' && systemDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const update = useCallback((p: ThemePref) => {
    try {
      if (p === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, p)
    } catch {
      /* ignore */
    }
    setPref(p)
  }, [])

  return { pref, dark, setPref: update }
}
