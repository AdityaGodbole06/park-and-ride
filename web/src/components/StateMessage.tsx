import { CloudSlash, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

interface StateMessageProps {
  tone: 'error' | 'empty' | 'offline'
  title: string
  body: string
  action?: ReactNode
}

const icons = {
  error: WarningCircle,
  empty: MagnifyingGlass,
  offline: CloudSlash,
}

export function StateMessage({ tone, title, body, action }: StateMessageProps) {
  const Icon = icons[tone]
  return (
    <div
      role={tone === 'empty' ? 'status' : 'alert'}
      className="animate-rise rounded-3xl bg-surface p-6 ring-1 ring-line"
    >
      <span
        className={`grid size-11 place-items-center rounded-full ${tone === 'empty' ? 'bg-soft text-ink' : 'bg-bad-soft text-bad'}`}
      >
        <Icon size={22} weight="bold" aria-hidden />
      </span>
      <h2 className="mt-4 text-xl font-bold tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-[48ch] text-[15px] text-body">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
