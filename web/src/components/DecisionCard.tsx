import { MapPin, WarningCircle } from '@phosphor-icons/react'
import { accessCopy, clock, spotInSentence, decisionSentence, feeCopy, minutesFromNow, relativeLeave, suggestionPlan } from '../lib/format'
import { useNow } from '../lib/hooks'
import { useSpots } from '../lib/spots'
import type { TripOption } from '../lib/types'
import { JourneyBar } from './JourneyBar'
import { LegTimeline } from './LegTimeline'
import { NearbyParking } from './NearbyParking'
import { ParkingLine, Warnings } from './OptionParts'

interface DecisionCardProps {
  option: TripOption
  destinationName: string
  isDesktop: boolean
}

export function DecisionCard({ option, destinationName, isDesktop }: DecisionCardProps) {
  const now = useNow()
  const { removed, select } = useSpots()
  const rawSuggestion = suggestionPlan(option)
  const suggestion = rawSuggestion && !removed.includes(rawSuggestion.spot.id) ? rawSuggestion : null
  const leaveAt = option.leave_at
  const { time, period } = clock(leaveAt)
  const rel = relativeLeave(leaveAt, now)
  const mins = minutesFromNow(leaveAt, now)
  const urgent = mins !== null && mins <= 5

  return (
    <article aria-labelledby="decision-heading" className="animate-rise overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
      {suggestion && (
        <div className="bg-ink px-5 py-4 text-inverse">
          <p className="text-[15px] leading-snug">
            <span className="font-semibold">
              {option.carpark.name} is {option.parking_status === 'filling' ? 'filling up' : 'full'}.
            </span>{' '}
            Park at {spotInSentence(suggestion.spot.name)}, then walk {suggestion.walkMinutes} min.
          </p>
          {suggestion.spot.warning && (
            <p className="mt-2 flex gap-1.5 text-sm text-inverse/80">
              <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
              {suggestion.spot.warning}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-full bg-inverse/15 px-2.5 text-xs font-medium">
              {accessCopy[suggestion.spot.access]}
            </span>
            <span className="inline-flex h-6 items-center rounded-full bg-inverse/15 px-2.5 text-xs font-medium">
              {feeCopy(suggestion.spot.fee)}
            </span>
            {suggestion.spot.max_stay && (
              <span className="inline-flex h-6 items-center rounded-full bg-inverse/15 px-2.5 text-xs font-medium">
                {suggestion.spot.max_stay} max
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                select(suggestion.spot.id)
                document.getElementById(`nearby-${option.carpark.id}`)?.scrollIntoView({ block: 'nearest' })
              }}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-inverse px-3 text-sm font-medium text-ink transition-opacity hover:opacity-90 focus-visible:outline-inverse"
            >
              <MapPin size={15} weight="fill" aria-hidden />
              Show me
            </button>
          </div>
        </div>
      )}

      <div className="space-y-5 p-5 sm:p-6">
        <div>
          <h2 id="decision-heading" className="text-sm font-medium text-body">
            Leave by
          </h2>
          <div className="mt-1 flex items-end justify-between gap-4">
            <p className="text-[64px] leading-[0.95] font-bold tracking-tighter tabular-nums sm:text-[72px]">
              {time}
              <span className="ml-1 text-2xl font-semibold tracking-normal text-body">{period}</span>
            </p>
            {rel && (
              <span
                className={`mb-2 inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap ${
                  urgent ? 'bg-ink text-inverse' : 'bg-soft text-ink'
                }`}
              >
                {rel}
              </span>
            )}
          </div>
          <p className="mt-3 text-lg leading-snug font-medium text-ink">{decisionSentence(option)}.</p>
        </div>

        <JourneyBar option={option} />
        <ParkingLine option={option} />
        <Warnings option={option} />
        <LegTimeline option={option} suggestion={suggestion} destinationName={destinationName} />
        <div id={`nearby-${option.carpark.id}`}>
          <NearbyParking option={option} showMap={!isDesktop} defaultOpen={!!rawSuggestion} />
        </div>
      </div>
    </article>
  )
}
