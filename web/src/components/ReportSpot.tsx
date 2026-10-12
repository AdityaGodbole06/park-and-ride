import { useId, useState, type FormEvent } from 'react'
import { ApiError, reportSpot } from '../lib/api'
import type { NearbySpot, ReportReason } from '../lib/types'
import { Button } from './ui/Button'

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'wrong_info', label: 'The details are wrong' },
  { value: 'not_allowed', label: "Commuters aren't allowed to park here" },
  { value: 'owner_request', label: 'I own or manage this property' },
  { value: 'other', label: 'Something else' },
]

interface ReportSpotProps {
  spot: NearbySpot
  onCancel: () => void
  onReported: () => void
}

/** Inline reason picker for flagging a community spot. */
export function ReportSpot({ spot, onCancel, onReported }: ReportSpotProps) {
  const id = useId()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!reason) {
      setError('Choose a reason.')
      return
    }
    setSending(true)
    setError('')
    try {
      await reportSpot(spot, reason, details.trim() || undefined)
      onReported()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send the report. Try again.")
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 animate-fade rounded-xl bg-soft p-3" aria-label={`Report ${spot.name}`}>
      <fieldset>
        <legend className="text-sm font-semibold">What's wrong with this spot?</legend>
        <div className="mt-2 space-y-1">
          {REASONS.map((r) => (
            <label
              key={r.value}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink"
            >
              <input
                type="radio"
                name={`${id}-reason`}
                value={r.value}
                checked={reason === r.value}
                onChange={() => {
                  setReason(r.value)
                  setError('')
                }}
                className="size-4 accent-[var(--ink)]"
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`${id}-details`} className="mt-2 block text-sm font-medium">
        Details <span className="font-normal text-body">(optional)</span>
      </label>
      <textarea
        id={`${id}-details`}
        rows={2}
        maxLength={280}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder={reason === 'owner_request' ? 'Your contact details, if you want us to follow up' : 'e.g. New sign says members only'}
        className="mt-1.5 w-full resize-none rounded-lg bg-surface px-3 py-2 text-[16px] outline-none ring-1 ring-line placeholder:text-mute focus-visible:ring-2 focus-visible:ring-ink"
      />
      {reason === 'owner_request' && (
        <p className="mt-1.5 text-xs text-body">We'll hide this spot straight away.</p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-bad">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" loading={sending}>
          Send report
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
