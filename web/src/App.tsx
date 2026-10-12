import { PencilSimple } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AddSpotSheet } from './components/AddSpotSheet'
import { Header } from './components/Header'
import { LoadingPlan } from './components/LoadingPlan'
import { OverviewMap, SpotMap } from './components/map/LazyMaps'
import { PlanForm } from './components/PlanForm'
import { Results } from './components/Results'
import { SavedCommute } from './components/SavedCommute'
import { StateMessage } from './components/StateMessage'
import { Button } from './components/ui/Button'
import { ApiError, getPlan } from './lib/api'
import { clockText, decisionSentence } from './lib/format'
import { useMediaQuery, useSavedCommute, useTheme } from './lib/hooks'
import { SpotsProvider, useSpots } from './lib/spots'
import type { PlanQuery, PlanResponse } from './lib/types'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; query: PlanQuery }
  | { kind: 'success'; query: PlanQuery; plan: PlanResponse }
  | { kind: 'error'; query: PlanQuery; message: string; offline: boolean }

function sameQuery(a: PlanQuery | null, b: PlanQuery | null) {
  if (!a || !b) return false
  return (
    a.from.lat === b.from.lat &&
    a.from.lon === b.from.lon &&
    a.to.lat === b.to.lat &&
    a.to.lon === b.to.lon &&
    a.timeMode === b.timeMode &&
    (a.timeMode === 'now' || a.time === b.time)
  )
}

const short = (name: string) => name.split(',')[0]

/** Short screen reader announcement; the full results are not live-read. */
function announce(status: Status) {
  if (status.kind === 'loading') return 'Planning your trip.'
  if (status.kind === 'error') return `Couldn't plan the trip. ${status.message}`
  if (status.kind !== 'success') return ''
  const best = status.plan.options[0]
  if (!best) return 'No park and ride trips found.'
  return `Leave by ${clockText(best.leave_at)}. ${decisionSentence(best)}.`
}

function TripSummary({ query, onEdit }: { query: PlanQuery; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left ring-1 ring-line transition-colors hover:bg-soft"
      aria-label={`Edit trip from ${query.from.name} to ${query.to.name}`}
    >
      <span className="flex flex-col items-center gap-1" aria-hidden>
        <span className="size-2 rounded-full bg-ink" />
        <span className="h-3 w-px bg-line" />
        <span className="size-2 bg-ink" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{short(query.from.name)}</span>
        <span className="block truncate text-[15px] font-medium">{short(query.to.name)}</span>
      </span>
      <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-soft px-3 text-sm font-medium">
        <PencilSimple size={15} weight="bold" aria-hidden />
        Edit
      </span>
    </button>
  )
}

function DesktopMap({ status, selectedIndex }: { status: Status; selectedIndex: number }) {
  const { spotsFor, selectedId, select } = useSpots()
  if (status.kind !== 'success' || !status.plan.options.length) return <OverviewMap />
  const option = status.plan.options[selectedIndex] ?? status.plan.options[0]
  const spots = spotsFor(option)
  return (
    <div className="relative size-full">
      <SpotMap
        key={option.carpark.id}
        carpark={option.carpark}
        spots={spots}
        suggestedId={option.suggested_spot?.id}
        selectedId={selectedId}
        onSelect={select}
        className="size-full rounded-none"
        zoomPosition="bottomright"
        label={`Map of ${option.carpark.name} car park and nearby parking`}
      />
      <div className="pointer-events-none absolute top-5 left-5 z-[1000] rounded-2xl bg-surface/95 px-4 py-3 shadow-float ring-1 ring-line backdrop-blur">
        <p className="text-sm font-semibold">{option.carpark.name} car park</p>
        <p className="text-xs text-body">
          {spots.length ? `${spots.length} other places to park nearby` : 'No other parking known nearby'}
        </p>
      </div>
    </div>
  )
}

function Planner() {
  const { pref, setPref } = useTheme()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [commute, saveCommute] = useSavedCommute()
  const [draft, setDraft] = useState<Partial<PlanQuery>>(() => commute ?? { timeMode: 'now' })
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [editing, setEditing] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)
  const ctrl = useRef<AbortController | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const { select } = useSpots()

  const run = useCallback(
    async (query: PlanQuery) => {
      ctrl.current?.abort()
      const c = new AbortController()
      ctrl.current = c
      setDraft(query)
      setStatus({ kind: 'loading', query })
      setExpanded(null)
      select(null)
      setEditing(false)
      try {
        const plan = await getPlan(query, c.signal)
        if (c.signal.aborted) return
        setStatus({ kind: 'success', query, plan })
      } catch (err) {
        if (c.signal.aborted) return
        const offline = err instanceof ApiError && err.status === 0
        const message = err instanceof Error ? err.message : 'Something went wrong.'
        setStatus({ kind: 'error', query, message, offline })
      }
    },
    [select],
  )

  useEffect(() => () => ctrl.current?.abort(), [])

  // Move focus to the answer on phones so screen readers and keyboards land there.
  useEffect(() => {
    if (status.kind === 'success' || status.kind === 'error') resultsRef.current?.focus({ preventScroll: true })
  }, [status.kind])

  const reset = () => {
    ctrl.current?.abort()
    setStatus({ kind: 'idle' })
    setEditing(true)
  }

  const activeQuery = status.kind === 'idle' ? null : status.query
  const showForm = editing || status.kind === 'idle' || isDesktop
  const loading = status.kind === 'loading'
  const commuteIsCurrent = sameQuery(commute, activeQuery)

  return (
    <div className="min-h-[100dvh] lg:grid lg:h-[100dvh] lg:grid-cols-[minmax(420px,500px)_1fr] lg:overflow-hidden">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-inverse focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div className="mx-auto w-full max-w-xl px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:max-w-none lg:overflow-y-auto lg:border-r lg:border-line lg:px-8">
        <Header theme={pref} onTheme={setPref} onHome={reset} />

        <main id="main" className="space-y-5 pt-2">
          {status.kind === 'idle' && (
            <h1 className="text-[32px] leading-[1.1] font-bold tracking-tight text-balance sm:text-4xl">
              Where are you headed?
            </h1>
          )}

          {commute && !commuteIsCurrent && showForm && (
            <SavedCommute
              commute={commute}
              onRun={() => run(commute)}
              onRemove={() => saveCommute(null)}
              disabled={loading}
            />
          )}

          {showForm ? (
            <PlanForm
              value={draft}
              onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              onSubmit={run}
              loading={loading}
            />
          ) : (
            activeQuery && <TripSummary query={activeQuery} onEdit={() => setEditing(true)} />
          )}

          {status.kind === 'idle' && !commute && (
            <p className="max-w-[46ch] pt-2 text-[15px] text-body">
              We compare the station car parks near you using live occupancy, drive times and the next trains, then
              tell you one thing: when to leave and where to park.
            </p>
          )}

          <p className="sr-only" aria-live="polite">
            {announce(status)}
          </p>
          <div ref={resultsRef} tabIndex={-1} className="outline-none">
            {status.kind === 'loading' && <LoadingPlan />}
            {status.kind === 'error' && (
              <StateMessage
                tone={status.offline ? 'offline' : 'error'}
                title={status.offline ? "Can't reach the planner" : "Couldn't plan that trip"}
                body={status.message}
                action={
                  <div className="flex gap-2">
                    <Button onClick={() => run(status.query)}>Try again</Button>
                    <Button variant="subtle" onClick={() => setEditing(true)}>
                      Change trip
                    </Button>
                  </div>
                }
              />
            )}
            {status.kind === 'success' && (
              <Results
                plan={status.plan}
                query={status.query}
                isSaved={commuteIsCurrent}
                onSave={() => saveCommute(status.query)}
                expandedBackup={expanded}
                onToggleBackup={(i) => {
                  setExpanded((e) => (e === i ? null : i))
                  select(null)
                }}
                isDesktop={isDesktop}
                onEdit={() => setEditing(true)}
              />
            )}
          </div>
        </main>
      </div>

      {isDesktop && (
        <aside className="relative hidden lg:block" aria-label="Map">
          <DesktopMap status={status} selectedIndex={expanded ?? 0} />
        </aside>
      )}

      <AddSpotSheet />
    </div>
  )
}

export default function App() {
  return (
    <SpotsProvider>
      <Planner />
    </SpotsProvider>
  )
}
