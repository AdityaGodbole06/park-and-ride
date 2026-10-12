import { CaretDown, CheckCircle, Plus, Quotes, UsersThree, WarningCircle } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { confirmSpot, getNearby } from '../lib/api'
import { accessCopy, feeCopy } from '../lib/format'
import { useConfirmedSpots } from '../lib/hooks'
import { useSpots } from '../lib/spots'
import type { NearbySpot, TripOption } from '../lib/types'
import { SpotMap } from './map/LazyMaps'
import { ReportSpot } from './ReportSpot'
import { Button } from './ui/Button'

interface NearbyParkingProps {
  option: TripOption
  /** Show the inline map (phones). Desktop uses the side map instead. */
  showMap: boolean
  defaultOpen?: boolean
}

const chipTone = {
  plain: 'bg-soft text-body',
  warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
  ink: 'bg-ink text-inverse',
}

function Chip({ children, tone = 'plain' }: { children: React.ReactNode; tone?: keyof typeof chipTone }) {
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap ${chipTone[tone]}`}>
      {children}
    </span>
  )
}

function SpotRow({
  spot,
  index,
  suggested,
  selected,
  onSelect,
  onUpdated,
  onRemoved,
}: {
  spot: NearbySpot
  index: number
  suggested: boolean
  selected: boolean
  onSelect: () => void
  onUpdated: (spot: NearbySpot) => void
  onRemoved: () => void
}) {
  const [reporting, setReporting] = useState(false)
  const [confirmedIds, markConfirmed] = useConfirmedSpots()
  const [state, setState] = useState<'idle' | 'sending' | 'error'>('idle')
  const confirmed = confirmedIds.includes(spot.id)
  const community = spot.source === 'community'

  return (
    <li className={`rounded-2xl p-3 transition-colors ${selected ? 'bg-soft' : ''}`}>
      <div className="grid grid-cols-[3.25rem_1fr] gap-3">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`Show ${spot.name}, ${spot.walk_minutes} minute walk, on the map`}
          className={`flex h-14 flex-col items-center justify-center self-start rounded-xl transition-colors ${
            suggested || selected ? 'bg-ink text-inverse' : 'bg-soft text-ink hover:bg-pressed'
          }`}
        >
          <span className="font-mono text-xl leading-none font-semibold tabular-nums">{spot.walk_minutes}</span>
          <span className="mt-0.5 text-[11px] leading-none font-medium opacity-75">min walk</span>
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`grid size-5 shrink-0 place-items-center font-mono text-[10px] font-semibold ring-[1.5px] ring-ink ${
                community ? 'rounded-[5px]' : 'rounded-full'
              }`}
              aria-hidden
            >
              {index + 1}
            </span>
            <h4 className="min-w-0 truncate font-semibold">{spot.name}</h4>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {suggested && <Chip tone="ink">Suggested</Chip>}
            <Chip tone={spot.access === 'public' ? 'ok' : 'warn'}>{accessCopy[spot.access]}</Chip>
            <Chip>{feeCopy(spot.fee)}</Chip>
            {spot.max_stay && <Chip tone="warn">{spot.max_stay} max</Chip>}
            {spot.capacity !== null && <Chip>~{spot.capacity} spaces</Chip>}
          </div>
          {spot.warning && (
            <p className="mt-2 flex gap-1.5 text-sm text-warn">
              <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
              <span>{spot.warning}</span>
            </p>
          )}
          {spot.notes && (
            <p className="mt-2 flex gap-2 text-sm text-body">
              <Quotes size={16} weight="fill" className="mt-0.5 shrink-0 text-mute" aria-hidden />
              <span>{spot.notes}</span>
            </p>
          )}
          {community && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-body">
                <UsersThree size={15} aria-hidden />
                Community tip
                {spot.confirmations > 0 &&
                  `, confirmed by ${spot.confirmations} ${spot.confirmations === 1 ? 'commuter' : 'commuters'}`}
                {spot.last_confirmed_at && `, last ${confirmedAgo(spot.last_confirmed_at)}`}
              </span>
              {confirmed ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-ok">
                  <CheckCircle size={15} weight="fill" aria-hidden />
                  Thanks for confirming
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={state === 'sending'}
                  onClick={async () => {
                    setState('sending')
                    try {
                      const updated = await confirmSpot(spot)
                      markConfirmed(spot.id)
                      onUpdated(updated)
                      setState('idle')
                    } catch {
                      setState('error')
                    }
                  }}
                  className="h-8"
                >
                  Still right
                </Button>
              )}
              <button
                type="button"
                onClick={() => setReporting((r) => !r)}
                aria-expanded={reporting}
                className="h-8 rounded-full px-2 text-xs font-medium text-body underline-offset-2 hover:text-ink hover:underline"
              >
                Report
              </button>
              {state === 'error' && <span className="text-xs text-bad">Couldn't save. Try again.</span>}
            </div>
          )}
          {community && reporting && (
            <ReportSpot spot={spot} onCancel={() => setReporting(false)} onReported={onRemoved} />
          )}
        </div>
      </div>
    </li>
  )
}

function confirmedAgo(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (Number.isNaN(days)) return 'recently'
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  return `${Math.round(days / 7)} weeks ago`
}

export function NearbyParking({ option, showMap, defaultOpen = false }: NearbyParkingProps) {
  const { spotsFor, setSpots, selectedId, select, startAdding, remove } = useSpots()
  const [open, setOpen] = useState(defaultOpen)
  const [loadingAll, setLoadingAll] = useState(false)
  const [loadedAll, setLoadedAll] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const panelId = useId()
  const spots = spotsFor(option)
  const fieldMissing = option.nearby_parking === undefined
  const suggestedId = option.suggested_spot?.id ?? null
  const hasOsm = spots.some((s) => s.source === 'osm')

  if (fieldMissing && spots.length === 0) return null

  return (
    <section className="border-t border-line pt-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-xl py-3 text-left"
      >
        <span>
          <span className="block font-semibold">Other places to park</span>
          <span className="block text-sm text-body">
            {spots.length === 0
              ? `None known near ${option.carpark.name} yet`
              : `${spots.length} within walking distance of ${option.carpark.name}`}
          </span>
        </span>
        <CaretDown
          size={18}
          weight="bold"
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      <div id={panelId} hidden={!open} className="pb-2">
        {open && (
          <div className="animate-fade space-y-3">
            {showMap && spots.length > 0 && (
              <SpotMap
                carpark={option.carpark}
                spots={spots}
                suggestedId={suggestedId}
                selectedId={selectedId}
                onSelect={select}
                className="h-56"
                label={`Map of parking near ${option.carpark.name}`}
              />
            )}
            {spots.length > 0 ? (
              <ul className="-mx-3 space-y-1">
                {spots.map((s, i) => (
                  <SpotRow
                    key={s.id}
                    spot={s}
                    index={i}
                    suggested={s.id === suggestedId}
                    selected={s.id === selectedId}
                    onSelect={() => select(s.id === selectedId ? null : s.id)}
                    onUpdated={(u) => setSpots(option.carpark.id, spots.map((x) => (x.id === u.id ? u : x)))}
                    onRemoved={() => {
                      remove(s.id)
                      if (selectedId === s.id) select(null)
                      setNotice(`Thanks. ${s.name} has been reported and removed from your list.`)
                    }}
                  />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl bg-soft p-4 text-sm text-body">
                Nobody has added a spot here yet. If you know somewhere commuters can park, add it for the next person.
              </p>
            )}
            <p className="text-sm text-ok empty:hidden" role="status">
              {notice}
            </p>
            {error && <p className="text-sm text-bad">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="subtle" icon={<Plus size={15} weight="bold" />} onClick={() => startAdding(option)}>
                Add a spot you know
              </Button>
              {!loadedAll && spots.length >= 5 && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={loadingAll}
                  onClick={async () => {
                    setLoadingAll(true)
                    setError('')
                    try {
                      setSpots(option.carpark.id, await getNearby(option.carpark))
                      setLoadedAll(true)
                    } catch {
                      setError("Couldn't load more spots.")
                    } finally {
                      setLoadingAll(false)
                    }
                  }}
                >
                  Show all nearby
                </Button>
              )}
            </div>
            {hasOsm && (
              <p className="text-xs text-mute">
                Parking locations include data &copy;{' '}
                <a href="https://www.openstreetmap.org/copyright" className="underline underline-offset-2 hover:text-ink">
                  OpenStreetMap contributors
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
