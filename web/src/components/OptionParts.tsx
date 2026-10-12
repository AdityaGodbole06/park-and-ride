import { Info, Warning } from '@phosphor-icons/react'
import { clockText } from '../lib/format'
import type { TripOption } from '../lib/types'
import { StatusPill } from './ui/StatusPill'

/** Parking status for this trip plus what the car park looks like right now. */
export function ParkingLine({ option }: { option: TripOption }) {
  const { carpark, parking_status } = option
  const hasCounts = carpark.free !== null && carpark.capacity !== null
  const now = hasCounts
    ? `${carpark.free} of ${carpark.capacity} spaces free now`
    : 'No live count for this car park'
  const label =
    parking_status === 'unknown'
      ? 'Unknown on arrival'
      : parking_status === 'available'
        ? 'Spaces available'
        : parking_status === 'filling'
          ? 'Filling up'
          : 'Car park full'

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <StatusPill status={parking_status} label={label} />
      <span className="text-sm text-body">
        {now}
        {carpark.reading_at && <span className="text-mute">, as of {clockText(carpark.reading_at)}</span>}
      </span>
      {carpark.tip && (
        <p className="flex w-full gap-1.5 text-sm text-body">
          <Info size={16} className="mt-0.5 shrink-0 text-mute" aria-hidden />
          <span>{carpark.tip}</span>
        </p>
      )}
    </div>
  )
}

/**
 * Backend warnings, minus ones the card already says louder: the "full right
 * now" line duplicates the status pill, and the "try X instead" line
 * duplicates the suggested-spot banner.
 */
export function Warnings({ option }: { option: TripOption }) {
  const spotName = option.suggested_spot?.name.toLowerCase()
  const warnings = option.warnings.filter((w) => {
    const text = w.toLowerCase()
    if (spotName && text.includes(spotName)) return false
    if (option.parking_status === 'full' && /^car park is full right now\.?$/.test(text)) return false
    return true
  })
  if (!warnings.length) return null
  return (
    <ul className="space-y-1.5" aria-label="Warnings">
      {warnings.map((w) => (
        <li key={w} className="flex gap-2.5 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
          <Warning size={18} weight="fill" className="mt-px shrink-0" aria-hidden />
          <span className="text-ink">{w}</span>
        </li>
      ))}
    </ul>
  )
}
