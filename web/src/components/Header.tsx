import { Desktop, Moon, Sun } from '@phosphor-icons/react'
import type { ThemePref } from '../lib/hooks'

interface HeaderProps {
  theme: ThemePref
  onTheme: (t: ThemePref) => void
  onHome: () => void
}

const next: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const label: Record<ThemePref, string> = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' }

export function Header({ theme, onTheme, onHome }: HeaderProps) {
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Desktop
  return (
    <header className="flex h-16 items-center justify-between">
      <button type="button" onClick={onHome} className="-ml-1 flex items-center gap-2.5 rounded-xl px-1 py-1">
        <span className="grid size-8 place-items-center rounded-[10px] bg-ink text-[17px] font-bold text-inverse" aria-hidden>
          P
        </span>
        <span className="text-[17px] font-bold tracking-tight">Park &amp; Ride</span>
      </button>
      <button
        type="button"
        onClick={() => onTheme(next[theme])}
        className="grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-soft"
        aria-label={`${label[theme]}. Switch to ${next[theme]}.`}
        title={label[theme]}
      >
        <Icon size={20} aria-hidden />
      </button>
    </header>
  )
}
