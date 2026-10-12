import { Car, FlagCheckered, PersonSimpleWalk } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { clock, spotInSentence, legMinutes, platform, shortStop, transitModes, type SuggestionPlan } from '../lib/format'
import type { TripOption } from '../lib/types'
import { LineBadge } from './ui/LineBadge'

interface Row {
  key: string
  time: string | null
  icon: ReactNode
  title: ReactNode
  detail?: ReactNode
  emphasis?: boolean
}

function Time({ iso }: { iso: string }) {
  const { time, period } = clock(iso)
  return (
    <time dateTime={iso} className="font-mono text-sm font-medium tabular-nums">
      {time}
      <span className="text-xs text-body">{period}</span>
    </time>
  )
}

function RailIcon({ children, solid }: { children: ReactNode; solid?: boolean }) {
  return (
    <span
      className={`relative z-10 grid size-7 place-items-center rounded-full ${solid ? 'bg-ink text-inverse' : 'bg-surface text-ink ring-1 ring-line'}`}
    >
      {children}
    </span>
  )
}

interface LegTimelineProps {
  option: TripOption
  suggestion?: SuggestionPlan | null
  destinationName?: string
}

export function LegTimeline({ option, suggestion, destinationName }: LegTimelineProps) {
  const parkName = suggestion ? spotInSentence(suggestion.spot.name) : `${option.carpark.name} car park`
  const rows: Row[] = [
    {
      key: 'drive',
      time: option.leave_at,
      icon: (
        <RailIcon solid>
          <Car size={15} weight="fill" />
        </RailIcon>
      ),
      title: <>Drive {option.drive_minutes} min</>,
      detail: <>to {parkName}</>,
      emphasis: true,
    },
    {
      key: 'park',
      time: option.arrive_carpark_at,
      icon: (
        <RailIcon>
          <span className="text-[13px] font-bold">P</span>
        </RailIcon>
      ),
      title: suggestion ? <>Park at {spotInSentence(suggestion.spot.name)}</> : <>Park at {option.carpark.name}</>,
      detail: suggestion ? (
        <>Official car park is {option.parking_status === 'filling' ? 'filling' : 'full'}</>
      ) : (
        <>Commuter car park, {option.carpark.suburb}</>
      ),
    },
  ]

  option.legs.forEach((leg, i) => {
    const mins = legMinutes(leg)
    if (transitModes.has(leg.mode)) {
      const plat = platform(leg.from)
      rows.push({
        key: `leg-${i}`,
        time: leg.depart,
        icon: (
          <span className="relative z-10 grid w-7 place-items-center">
            <LineBadge mode={leg.mode} line={leg.line} size="sm" />
          </span>
        ),
        title: (
          <>
            {shortStop(leg.from)}
            <span className="text-body"> to </span>
            {shortStop(leg.to)}
          </>
        ),
        detail: (
          <>
            {mins} min{plat ? `, ${plat}` : ''}
          </>
        ),
        emphasis: true,
      })
    } else {
      rows.push({
        key: `leg-${i}`,
        time: leg.depart,
        icon: (
          <RailIcon>
            <PersonSimpleWalk size={15} weight="bold" />
          </RailIcon>
        ),
        title: <>Walk {mins} min</>,
        detail: <>to {shortStop(leg.to)}</>,
      })
    }
  })

  rows.push({
    key: 'arrive',
    time: option.arrive_at,
    icon: (
      <RailIcon solid>
        <FlagCheckered size={14} weight="fill" />
      </RailIcon>
    ),
    title: <>Arrive</>,
    detail: destinationName ? <>{destinationName}</> : undefined,
    emphasis: true,
  })

  return (
    <ol className="relative" aria-label="Trip steps">
      <span className="absolute top-4 bottom-4 left-[4.6rem] w-px bg-line" aria-hidden />
      {rows.map((r) => (
        <li key={r.key} className="relative grid grid-cols-[3.5rem_1.75rem_1fr] items-start gap-x-3 py-1.5">
          <span className="pt-1 text-right">{r.time ? <Time iso={r.time} /> : null}</span>
          <span className="flex justify-center">{r.icon}</span>
          <span className="min-w-0 pt-0.5">
            <span className={`block text-[15px] leading-snug ${r.emphasis ? 'font-semibold' : 'font-medium'}`}>{r.title}</span>
            {r.detail && <span className="block text-sm text-body">{r.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
