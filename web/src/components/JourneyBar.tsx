import { legMinutes, transitModes } from '../lib/format'
import type { TripOption } from '../lib/types'
import { lineTone } from './ui/LineBadge'

interface Segment {
  key: string
  minutes: number
  tone: string
  label: string
}

/** Proportional strip of the whole trip: drive, park, walk, ride. */
export function JourneyBar({ option }: { option: TripOption }) {
  const parkMins = legMinutes({ depart: option.arrive_carpark_at, arrive: option.depart_carpark_at })
  const segments: Segment[] = [
    { key: 'drive', minutes: option.drive_minutes, tone: 'bg-ink', label: `drive ${option.drive_minutes} min` },
    ...(parkMins > 0 ? [{ key: 'park', minutes: parkMins, tone: 'bg-pressed', label: `park ${parkMins} min` }] : []),
    ...option.legs.map((leg, i) => {
      const minutes = legMinutes(leg)
      const transit = transitModes.has(leg.mode)
      return {
        key: `leg-${i}`,
        minutes,
        tone: transit ? lineTone(leg.mode, leg.line).split(' ')[0] : 'bg-mute/50',
        label: `${transit ? (leg.line ?? leg.mode) : 'walk'} ${minutes} min`,
      }
    }),
  ].filter((s) => s.minutes > 0)

  return (
    <div className="flex h-1.5 w-full gap-0.5" role="img" aria-label={`Trip breakdown: ${segments.map((s) => s.label).join(', ')}`}>
      {segments.map((s) => (
        <span key={s.key} className={`min-w-1.5 rounded-full ${s.tone}`} style={{ flexGrow: s.minutes }} />
      ))}
    </div>
  )
}
