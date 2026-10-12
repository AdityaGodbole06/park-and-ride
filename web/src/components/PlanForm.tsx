import { ArrowsDownUp, ArrowRight } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import type { PlanQuery, TimeMode } from '../lib/types'
import { PlaceInput } from './PlaceInput'
import { Button } from './ui/Button'
import { Segmented } from './ui/Segmented'

interface PlanFormProps {
  value: PlanQuery | Partial<PlanQuery>
  onChange: (next: Partial<PlanQuery>) => void
  onSubmit: (query: PlanQuery) => void
  loading: boolean
}

const TIME_OPTIONS: { value: TimeMode; label: string }[] = [
  { value: 'now', label: 'Leave now' },
  { value: 'depart_at', label: 'Leave at' },
  { value: 'arrive_by', label: 'Arrive by' },
]

export function PlanForm({ value, onChange, onSubmit, loading }: PlanFormProps) {
  const [errors, setErrors] = useState<{ from?: string; to?: string; time?: string }>({})
  const timeMode = value.timeMode ?? 'now'

  function submit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!value.from) next.from = 'Pick a starting point from the list.'
    if (!value.to) next.to = 'Pick a destination from the list.'
    if (timeMode !== 'now' && !/^\d{2}:\d{2}$/.test(value.time ?? '')) next.time = 'Enter a time.'
    setErrors(next)
    if (Object.keys(next).length) return
    onSubmit({ from: value.from!, to: value.to!, timeMode, time: value.time ?? '' })
  }

  const set = (patch: Partial<PlanQuery>) => {
    onChange(patch)
    setErrors((prev) => ({
      ...prev,
      ...('from' in patch ? { from: undefined } : {}),
      ...('to' in patch ? { to: undefined } : {}),
      ...('time' in patch ? { time: undefined } : {}),
    }))
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Plan a trip" className="space-y-3">
      <div className="flex rounded-2xl bg-surface ring-1 ring-line">
        <div className="relative min-w-0 flex-1">
          {/* connector between the two markers */}
          <span className="pointer-events-none absolute top-[2.4rem] bottom-[2.4rem] left-[1.47rem] w-px bg-line" aria-hidden />
          <PlaceInput
            label="From"
            placeholder="Home or suburb"
            value={value.from ?? null}
            onChange={(from) => set({ from: from ?? undefined })}
            marker={<span className="block size-2.5 rounded-full bg-ink ring-4 ring-soft" />}
            allowLocation
            error={errors.from}
          />
          <div className="ml-11 border-t border-line" />
          <PlaceInput
            label="To"
            placeholder="Work, station or landmark"
            value={value.to ?? null}
            onChange={(to) => set({ to: to ?? undefined })}
            marker={<span className="block size-2.5 bg-ink ring-4 ring-soft" />}
            error={errors.to}
          />
        </div>
        <div className="flex items-center border-l border-line px-1.5">
          <button
            type="button"
            onClick={() => onChange({ from: value.to, to: value.from })}
            className="grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-soft"
            aria-label="Swap start and destination"
          >
            <ArrowsDownUp size={18} weight="bold" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="sm:flex-1">
          <Segmented
            label="When"
            value={timeMode}
            options={TIME_OPTIONS}
            onChange={(m) => {
              const patch: Partial<PlanQuery> = { timeMode: m }
              if (m !== 'now' && !value.time) patch.time = m === 'arrive_by' ? '08:30' : '07:30'
              set(patch)
            }}
          />
        </div>
        {timeMode !== 'now' && (
          <div className="animate-fade">
            <label htmlFor="plan-time" className="sr-only">
              {timeMode === 'arrive_by' ? 'Arrive by time' : 'Leave at time'}
            </label>
            <input
              id="plan-time"
              type="time"
              required
              value={value.time ?? ''}
              onChange={(e) => set({ time: e.target.value })}
              aria-invalid={errors.time ? true : undefined}
              className="h-11 w-full rounded-full bg-soft px-4 font-mono text-[15px] font-medium text-ink outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ink sm:w-36"
            />
            {errors.time && <p className="mt-1 px-4 text-sm text-bad">{errors.time}</p>}
          </div>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        block
        loading={loading}
        icon={loading ? undefined : <ArrowRight size={20} weight="bold" />}
        className="flex-row-reverse"
      >
        {loading ? 'Planning your trip' : 'Plan trip'}
      </Button>
    </form>
  )
}
