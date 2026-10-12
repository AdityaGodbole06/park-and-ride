import { BookmarkSimple, Check, Info } from '@phosphor-icons/react'
import { clockText } from '../lib/format'
import type { PlanQuery, PlanResponse } from '../lib/types'
import { BackupOption } from './BackupOption'
import { DecisionCard } from './DecisionCard'
import { StateMessage } from './StateMessage'
import { Button } from './ui/Button'

interface ResultsProps {
  plan: PlanResponse
  query: PlanQuery
  isSaved: boolean
  onSave: () => void
  expandedBackup: number | null
  onToggleBackup: (index: number) => void
  isDesktop: boolean
  onEdit: () => void
}

function summary(plan: PlanResponse, query: PlanQuery) {
  if (query.timeMode === 'now') return 'Leaving now'
  return plan.mode === 'arrive_by' ? `Arriving by ${clockText(plan.time)}` : `Leaving at ${clockText(plan.time)}`
}

export function Results({ plan, query, isSaved, onSave, expandedBackup, onToggleBackup, isDesktop, onEdit }: ResultsProps) {
  const destinationName = query.to.name.split(',')[0]
  const [best, ...backups] = plan.options

  if (!best) {
    return (
      <StateMessage
        tone="empty"
        title="No park & ride trips for this one"
        body={`We checked ${plan.carparks_considered.length || 'the nearby'} car parks but couldn't find a train or metro that gets you there. Try a different time, or a destination closer to a station.`}
        action={
          <Button variant="secondary" onClick={onEdit}>
            Change trip
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-body">
          <span className="font-medium text-ink">{summary(plan, query)}</span>
          <span>, compared {plan.carparks_considered.length} car parks</span>
        </p>
        <Button
          size="sm"
          variant={isSaved ? 'subtle' : 'secondary'}
          onClick={onSave}
          disabled={isSaved}
          icon={isSaved ? <Check size={15} weight="bold" /> : <BookmarkSimple size={15} weight="bold" />}
        >
          {isSaved ? 'Saved' : 'Save commute'}
        </Button>
      </div>

      <DecisionCard option={best} destinationName={destinationName} isDesktop={isDesktop} />

      {backups.length > 0 && (
        <section aria-labelledby="backups-heading">
          <h2 id="backups-heading" className="mb-3 text-lg font-bold tracking-tight">
            Backups
          </h2>
          <ul className="space-y-2.5">
            {backups.map((o, i) => (
              <BackupOption
                key={o.carpark.id}
                option={o}
                best={best}
                expanded={expandedBackup === i + 1}
                onToggle={() => onToggleBackup(i + 1)}
                destinationName={destinationName}
                isDesktop={isDesktop}
              />
            ))}
          </ul>
        </section>
      )}

      <details className="group rounded-2xl text-sm text-body">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl py-1 font-medium hover:text-ink [&::-webkit-details-marker]:hidden">
          <Info size={16} aria-hidden />
          How this was worked out
        </summary>
        <div className="mt-2 space-y-2 pl-6">
          <p>
            Car parks compared: {plan.carparks_considered.join(', ')}.
          </p>
          <p>
            Parking uses live Transport for NSW occupancy. For trips more than 45 minutes away it shows as unknown until fill-up predictions arrive.
          </p>
          {/no live traffic/i.test(plan.drive_times) && <p>Drive times don't include live traffic yet, so allow a few extra minutes in peak hour.</p>}
          <p>
            Maps &copy;{' '}
            <a href="https://www.openstreetmap.org/copyright" className="underline underline-offset-2 hover:text-ink">
              OpenStreetMap contributors
            </a>
            .
          </p>
        </div>
      </details>
    </div>
  )
}
