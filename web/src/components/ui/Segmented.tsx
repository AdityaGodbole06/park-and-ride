import { useId, type KeyboardEvent } from 'react'

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

/** Radio group styled as a pill switcher. Arrow keys move the selection. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const name = useId()
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = options.findIndex((o) => o.value === value)
    const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length]
    onChange(next.value)
    document.getElementById(`${name}-${next.value}`)?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKey} className="flex rounded-full bg-soft p-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            id={`${name}-${o.value}`}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`h-9 flex-1 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${
              active ? 'bg-surface text-ink shadow-float dark:bg-pressed' : 'text-body hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
