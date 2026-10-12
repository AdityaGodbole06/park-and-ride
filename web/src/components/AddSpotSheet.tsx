import { CheckCircle, HandTap } from '@phosphor-icons/react'
import { useId, useState, type FormEvent } from 'react'
import { ApiError, createSpot } from '../lib/api'
import { haversineMetres } from '../lib/format'
import { useSpots } from '../lib/spots'
import { SpotMap } from './map/LazyMaps'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'

const NAME_MAX = 80
const NOTES_MAX = 280

/** Remounts per car park so the form starts empty each time. */
export function AddSpotSheet() {
  const { addingFor } = useSpots()
  return <AddSpotSheetInner key={addingFor?.carpark.id ?? 'closed'} />
}

function AddSpotSheetInner() {
  const { addingFor: option, startAdding, spotsFor, setSpots, select } = useSpots()
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null)
  const [errors, setErrors] = useState<{ name?: string; picked?: string; submit?: string }>({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const nameId = useId()
  const notesId = useId()


  const close = () => startAdding(null)

  const farAway = option && picked ? haversineMetres(option.carpark, picked) > 1500 : false

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!option) return
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Give the spot a name people will recognise.'
    if (!picked) next.picked = 'Tap the map where people should park.'
    setErrors(next)
    if (next.name || next.picked) return
    setSaving(true)
    try {
      const spot = await createSpot(
        { carpark_id: option.carpark.id, name: name.trim(), lat: picked!.lat, lon: picked!.lon, notes: notes.trim() || undefined },
      )
      const current = spotsFor(option)
      setSpots(
        option.carpark.id,
        [...current.filter((s) => s.id !== spot.id), spot].sort((a, b) => a.walk_minutes - b.walk_minutes),
      )
      select(spot.id)
      setDone(spot.name)
    } catch (err) {
      setErrors({ submit: err instanceof ApiError ? err.message : "Couldn't save the spot. Try again." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={!!option}
      onClose={close}
      title={done ? 'Spot added' : 'Add a spot you know'}
      description={
        done
          ? undefined
          : option
            ? `Somewhere commuters can park near ${option.carpark.name} when the station car park is full.`
            : undefined
      }
      footer={
        done ? (
          <Button block onClick={close}>
            Done
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="subtle" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form="add-spot" loading={saving} className="flex-1">
              Add spot
            </Button>
          </div>
        )
      }
    >
      {option && done && (
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle size={48} weight="fill" className="text-ok" aria-hidden />
          <p className="mt-3 text-lg font-semibold">{done} is on the list</p>
          <p className="mt-1 max-w-xs text-sm text-body">
            Other commuters going to {option.carpark.name} will see it, and can confirm it still works.
          </p>
        </div>
      )}
      {option && !done && (
        <form id="add-spot" onSubmit={submit} noValidate className="space-y-5 pt-1">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium" id={`${nameId}-map`}>
                Location
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-body">
                <HandTap size={14} aria-hidden />
                {picked ? 'Tap again to move the pin' : 'Tap the map to drop a pin'}
              </span>
            </div>
            <SpotMap
              carpark={option.carpark}
              spots={[]}
              picked={picked}
              onPick={(p) => {
                setPicked(p)
                setErrors((x) => ({ ...x, picked: undefined }))
              }}
              className={`h-60 ${errors.picked ? 'ring-2 ring-bad' : ''}`}
              label={`Map near ${option.carpark.name}. Tap to choose the spot location.`}
            />
            {errors.picked && (
              <p role="alert" className="mt-1.5 text-sm text-bad">
                {errors.picked}
              </p>
            )}
            {farAway && !errors.picked && (
              <p className="mt-1.5 text-sm text-warn">That's more than 1.5 km from the station, which is too far to add. Move the pin closer.</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={nameId} className="text-sm font-medium">
              Name
            </label>
            <input
              id={nameId}
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => {
                setName(e.target.value)
                setErrors((x) => ({ ...x, name: undefined }))
              }}
              placeholder="e.g. Emmanuel Baptist Church"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${nameId}-err` : undefined}
              className="h-12 rounded-xl bg-soft px-4 text-[16px] text-ink outline-none placeholder:text-mute focus-visible:ring-2 focus-visible:ring-ink aria-invalid:ring-2 aria-invalid:ring-bad"
            />
            {errors.name && (
              <p id={`${nameId}-err`} role="alert" className="text-sm text-bad">
                {errors.name}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor={notesId} className="text-sm font-medium">
                Tips <span className="font-normal text-body">(optional)</span>
              </label>
              <span className="font-mono text-xs text-body tabular-nums" aria-live="polite">
                {notes.length}/{NOTES_MAX}
              </span>
            </div>
            <textarea
              id={notesId}
              value={notes}
              maxLength={NOTES_MAX}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="When it fills, time limits, which days it's OK"
              className="resize-none rounded-xl bg-soft px-4 py-3 text-[16px] text-ink outline-none placeholder:text-mute focus-visible:ring-2 focus-visible:ring-ink"
            />
          </div>

          {errors.submit && (
            <p role="alert" className="rounded-xl bg-bad-soft p-3 text-sm text-bad">
              {errors.submit}
            </p>
          )}
        </form>
      )}
    </Sheet>
  )
}
