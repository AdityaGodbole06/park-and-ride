import { ArrowRight, BookmarkSimple, Trash } from '@phosphor-icons/react'
import type { PlanQuery } from '../lib/types'

interface SavedCommuteProps {
  commute: PlanQuery
  onRun: () => void
  onRemove: () => void
  disabled?: boolean
}

function when(c: PlanQuery) {
  if (c.timeMode === 'now') return 'Leaving now'
  const [h, m] = c.time.split(':').map(Number)
  const t = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
  return c.timeMode === 'arrive_by' ? `Arrive by ${t}` : `Leave at ${t}`
}

const short = (name: string) => name.split(',')[0]

/** One tap to re-run the usual trip. */
export function SavedCommute({ commute, onRun, onRemove, disabled }: SavedCommuteProps) {
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={onRun}
        disabled={disabled}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-ink p-3 pr-4 text-left text-inverse transition-[transform,opacity] active:scale-[0.99] disabled:opacity-60"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-inverse/15">
          <BookmarkSimple size={20} weight="fill" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium opacity-70">My commute, {when(commute).toLowerCase()}</span>
          <span className="block truncate font-semibold">
            {short(commute.from.name)} to {short(commute.to.name)}
          </span>
        </span>
        <ArrowRight size={20} weight="bold" className="shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="grid w-12 shrink-0 place-items-center rounded-2xl bg-soft text-body transition-colors hover:bg-pressed hover:text-ink"
        aria-label="Forget my saved commute"
      >
        <Trash size={18} aria-hidden />
      </button>
    </div>
  )
}
