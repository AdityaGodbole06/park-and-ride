import { CheckCircle } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

const STEPS = [
  { at: 0, text: 'Checking live car park numbers' },
  { at: 1400, text: 'Working out drive times' },
  { at: 2800, text: 'Finding trains and metros' },
  { at: 5000, text: 'Picking the best option' },
]

function Bone({ className }: { className: string }) {
  return (
    <span
      className={`block rounded-full bg-[linear-gradient(90deg,var(--soft)_0%,var(--pressed)_50%,var(--soft)_100%)] bg-[length:200%_100%] animate-shimmer ${className}`}
    />
  )
}

/** /plan takes 3-8 s. Show the shape of the answer and what is happening. */
export function LoadingPlan() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const t = setInterval(() => setElapsed(Date.now() - start), 200)
    return () => clearInterval(t)
  }, [])
  const current = STEPS.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0)
  const slow = elapsed > 9000

  return (
    <div className="space-y-6" aria-busy="true">
      <div className="rounded-3xl bg-surface p-5 ring-1 ring-line sm:p-6">
        <Bone className="h-3.5 w-16" />
        <Bone className="mt-3 h-14 w-44" />
        <Bone className="mt-4 h-4 w-full max-w-sm" />
        <Bone className="mt-2 h-4 w-2/3" />
        <Bone className="mt-6 h-1.5 w-full" />

        <ol className="mt-6 space-y-2.5" aria-live="polite">
          {STEPS.map((s, i) => {
            const done = i < current
            const active = i === current
            return (
              <li
                key={s.text}
                className={`flex items-center gap-2.5 text-[15px] transition-colors duration-300 ${
                  done ? 'text-body' : active ? 'font-medium text-ink' : 'text-mute'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                {done ? (
                  <CheckCircle size={18} weight="fill" className="text-ok" aria-hidden />
                ) : active ? (
                  <span className="grid size-[18px] place-items-center" aria-hidden>
                    <span className="size-3.5 animate-spin rounded-full border-2 border-ink border-t-transparent" />
                  </span>
                ) : (
                  <span className="grid size-[18px] place-items-center" aria-hidden>
                    <span className="size-2 rounded-full bg-pressed" />
                  </span>
                )}
                {s.text}
                {done && <span className="sr-only">, done</span>}
              </li>
            )
          })}
        </ol>
        {slow && <p className="mt-4 text-sm text-body">Still working. Live timetables can be slow in the morning peak.</p>}
      </div>

      <div className="space-y-2.5">
        <Bone className="h-5 w-24" />
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <div className="flex justify-between">
              <Bone className="h-4 w-32" />
              <Bone className="h-5 w-16" />
            </div>
            <Bone className="mt-4 h-1.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
