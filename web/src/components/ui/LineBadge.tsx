import type { LegMode } from '../../lib/types'

/** Sydney network line colours, so badges read like station signage. */
const LINE_COLOURS: Record<string, string> = {
  M1: 'bg-[#168388] text-white',
  T1: 'bg-[#f99d1c] text-[#111113]',
  T2: 'bg-[#0098cd] text-white',
  T3: 'bg-[#f37021] text-[#111113]',
  T4: 'bg-[#005aa3] text-white',
  T5: 'bg-[#c4258f] text-white',
  T6: 'bg-[#7c3e21] text-white',
  T7: 'bg-[#6f818e] text-white',
  T8: 'bg-[#00954c] text-white',
  T9: 'bg-[#d11f2f] text-white',
  L1: 'bg-[#be1622] text-white',
  L2: 'bg-[#dd1e25] text-white',
  L3: 'bg-[#781140] text-white',
  L4: 'bg-[#bb2043] text-white',
}

const MODE_COLOURS: Record<string, string> = {
  metro: 'bg-[#168388] text-white',
  train: 'bg-[#f6891f] text-[#111113]',
  'light rail': 'bg-[#e4022d] text-white',
  bus: 'bg-[#00b5ef] text-[#111113]',
  'school bus': 'bg-[#00b5ef] text-[#111113]',
  coach: 'bg-[#732a82] text-white',
  ferry: 'bg-[#5ab031] text-[#111113]',
}

interface LineBadgeProps {
  mode: LegMode
  line: string | null
  size?: 'sm' | 'md'
}

export function lineTone(mode: LegMode, line: string | null) {
  return (line && LINE_COLOURS[line.toUpperCase()]) || MODE_COLOURS[mode] || 'bg-ink text-inverse'
}

export function LineBadge({ mode, line, size = 'md' }: LineBadgeProps) {
  const colour = lineTone(mode, line)
  const text = line ?? (mode === 'metro' ? 'Metro' : mode.charAt(0).toUpperCase() + mode.slice(1))
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-mono font-semibold tracking-tight ${colour} ${
        size === 'sm' ? 'h-5 min-w-6 px-1.5 text-[11px]' : 'h-6 min-w-7 px-1.5 text-xs'
      }`}
    >
      <span className="sr-only">{mode} line </span>
      {text}
    </span>
  )
}
