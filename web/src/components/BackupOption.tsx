import { CaretDown } from '@phosphor-icons/react'
import { useId } from 'react'
import { clock, spotInSentence, firstTransitLeg, minutesFromNow, suggestionPlan } from '../lib/format'
import { useSpots } from '../lib/spots'
import type { TripOption } from '../lib/types'
import { JourneyBar } from './JourneyBar'
import { LegTimeline } from './LegTimeline'
import { NearbyParking } from './NearbyParking'
import { ParkingLine, Warnings } from './OptionParts'
import { LineBadge } from './ui/LineBadge'
import { StatusPill } from './ui/StatusPill'

interface BackupOptionProps {
  option: TripOption
  best: TripOption
  expanded: boolean
  onToggle: () => void
  destinationName: string
  isDesktop: boolean
}

function diff(a: string, b: string) {
  const d = minutesFromNow(a, 0)! - minutesFromNow(b, 0)!
  return d
}

/** "Leave 4 min earlier, arrive 2 min later" relative to the top pick. */
function comparison(option: TripOption, best: TripOption) {
  const leave = diff(option.leave_at, best.leave_at)
  const arrive = diff(option.arrive_at, best.arrive_at)
  const parts: string[] = []
  if (leave !== 0) parts.push(`leave ${Math.abs(leave)} min ${leave < 0 ? 'earlier' : 'later'}`)
  if (arrive !== 0) parts.push(`arrive ${Math.abs(arrive)} min ${arrive < 0 ? 'earlier' : 'later'}`)
  if (!parts.length) return 'Same times as the top pick'
  const s = parts.join(', ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function BackupOption({ option, best, expanded, onToggle, destinationName, isDesktop }: BackupOptionProps) {
  const panelId = useId()
  const leave = clock(option.leave_at)
  const transit = firstTransitLeg(option)
  const { removed } = useSpots()
  const rawSuggestion = suggestionPlan(option)
  const suggestion = rawSuggestion && !removed.includes(rawSuggestion.spot.id) ? rawSuggestion : null

  return (
    <li className={`rounded-2xl bg-surface ring-1 transition-shadow ${expanded ? 'ring-ink' : 'ring-line hover:ring-pressed'}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="w-full rounded-2xl p-4 text-left"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-[17px] font-semibold">
              <span className="truncate">{option.carpark.name}</span>
              {transit && <LineBadge mode={transit.mode} line={transit.line} size="sm" />}
            </h3>
            <p className="mt-0.5 text-sm text-body">{comparison(option, best)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-body">Leave by</p>
            <p className="font-mono text-xl font-semibold tabular-nums">
              {leave.time}
              <span className="text-sm text-body">{leave.period}</span>
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <StatusPill
            status={option.parking_status}
            size="sm"
            label={option.parking_status === 'unknown' ? 'Parking unknown' : undefined}
          />
          <div className="flex-1">
            <JourneyBar option={option} />
          </div>
          <CaretDown
            size={16}
            weight="bold"
            className={`shrink-0 text-body transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </div>
      </button>

      <div id={panelId} hidden={!expanded}>
        {expanded && (
          <div className="animate-fade space-y-4 px-4 pb-4">
            {suggestion && (
              <p className="rounded-xl bg-ink px-3.5 py-3 text-sm text-inverse">
                <span className="font-semibold">
                  {option.carpark.name} is {option.parking_status === 'filling' ? 'filling up' : 'full'}.
                </span> Park at {spotInSentence(suggestion.spot.name)}, then walk {suggestion.walkMinutes} min.
                {suggestion.spot.warning && <span className="mt-1 block text-inverse/80">{suggestion.spot.warning}</span>}
              </p>
            )}
            <ParkingLine option={option} />
            <Warnings option={option} />
            <LegTimeline option={option} suggestion={suggestion} destinationName={destinationName} />
            <NearbyParking option={option} showMap={!isDesktop} />
          </div>
        )}
      </div>
    </li>
  )
}
