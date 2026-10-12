import type { ParkingStatus } from '../../lib/types'
import { statusCopy } from '../../lib/format'

interface StatusPillProps {
  status: ParkingStatus
  size?: 'sm' | 'md'
  label?: string
}

const tone: Record<ParkingStatus, string> = {
  available: 'bg-ok-soft text-ok',
  filling: 'bg-warn-soft text-warn',
  full: 'bg-bad-soft text-bad',
  unknown: 'bg-soft text-body',
}

const glyph: Record<ParkingStatus, string> = {
  available: 'bg-ok',
  filling: 'bg-warn',
  full: 'bg-bad',
  unknown: 'bg-mute',
}

/** Parking status chip. The dot carries real state, so it stays. */
export function StatusPill({ status, size = 'md', label }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${tone[status]} ${
        size === 'sm' ? 'h-6 px-2.5 text-xs' : 'h-7 px-3 text-[13px]'
      }`}
    >
      <span className={`size-1.5 rounded-full ${glyph[status]}`} aria-hidden />
      {label ?? statusCopy[status].label}
    </span>
  )
}
