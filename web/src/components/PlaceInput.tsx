import {
  Buildings,
  Crosshair,
  House,
  MapPin,
  NavigationArrow,
  SpinnerGap,
  Train,
  XCircle,
} from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { searchPlaces } from '../lib/api'
import { useDebounced } from '../lib/hooks'
import type { Place } from '../lib/types'

interface PlaceInputProps {
  label: string
  placeholder: string
  value: Place | null
  onChange: (place: Place | null) => void
  marker: ReactNode
  allowLocation?: boolean
  error?: string
  autoFocus?: boolean
}

function PlaceIcon({ type }: { type: string }) {
  const props = { size: 18, weight: 'regular' as const, className: 'text-body' }
  if (type === 'stop') return <Train {...props} />
  if (type === 'singlehouse') return <House {...props} />
  if (type === 'poi') return <Buildings {...props} />
  return <MapPin {...props} />
}

function splitName(name: string) {
  const i = name.indexOf(',')
  return i === -1 ? { main: name, rest: '' } : { main: name.slice(0, i), rest: name.slice(i + 1).trim() }
}

type LocateState = 'idle' | 'locating' | 'error'

export function PlaceInput({
  label,
  placeholder,
  value,
  onChange,
  marker,
  allowLocation,
  error,
  autoFocus,
}: PlaceInputProps) {
  const id = useId()
  const listId = `${id}-list`
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [locate, setLocate] = useState<LocateState>('idle')
  const [locateMsg, setLocateMsg] = useState('')
  const query = useDebounced(text.trim(), 250)

  // Keep the text in sync when the parent sets a place (saved commute, swap),
  // but not when the change came from this input.
  const emitted = useRef<Place | null>(value)
  useEffect(() => {
    if (value !== emitted.current) setText(value?.name ?? '')
    emitted.current = value
  }, [value])
  const emit = (p: Place | null) => {
    emitted.current = p
    onChange(p)
  }

  useEffect(() => {
    if (!open || query.length < 2 || query === value?.name) {
      setResults([])
      setSearching(false)
      return
    }
    const ctrl = new AbortController()
    setSearching(true)
    setSearchError(false)
    searchPlaces(query, ctrl.signal)
      .then((r) => {
        setResults(r)
        setActive(r.length ? 0 : -1)
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') {
          setResults([])
          setSearchError(true)
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setSearching(false)
      })
    return () => ctrl.abort()
  }, [query, open, value?.name])

  const showLocateRow = allowLocation && open && text.trim().length < 2
  const items: ({ kind: 'locate' } | { kind: 'place'; place: Place })[] = [
    ...(showLocateRow ? [{ kind: 'locate' as const }] : []),
    ...results.map((place) => ({ kind: 'place' as const, place })),
  ]
  const listVisible = open && (items.length > 0 || (query.length >= 2 && !searching && query !== value?.name))

  function pick(place: Place) {
    emit(place)
    setText(place.name)
    setOpen(false)
    setResults([])
  }

  function locateMe() {
    setOpen(false)
    if (!('geolocation' in navigator)) {
      setLocate('error')
      setLocateMsg("This browser can't share your location.")
      return
    }
    setLocate('locating')
    setLocateMsg('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocate('idle')
        pick({
          name: 'Current location',
          type: 'location',
          lat: Number(pos.coords.latitude.toFixed(6)),
          lon: Number(pos.coords.longitude.toFixed(6)),
        })
      },
      (err) => {
        setLocate('error')
        setLocateMsg(
          err.code === err.PERMISSION_DENIED
            ? 'Location is blocked. Allow it in your browser settings, or type an address.'
            : "Couldn't get your location. Type an address instead.",
        )
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    )
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(items.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' && open && active >= 0 && items[active]) {
      e.preventDefault()
      const item = items[active]
      if (item.kind === 'locate') locateMe()
      else pick(item.place)
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    }
  }

  const message = error || (locate === 'error' ? locateMsg : '')

  return (
    <div className="relative">
      <div className="flex items-center gap-3 pr-2 pl-4">
        <span className="flex w-4 shrink-0 justify-center" aria-hidden>
          {marker}
        </span>
        <div className="min-w-0 flex-1 py-2.5">
          <label htmlFor={id} className="block text-xs font-medium text-body">
            {label}
          </label>
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            aria-expanded={listVisible}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={listVisible && active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? `${id}-msg` : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            autoFocus={autoFocus}
            placeholder={placeholder}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setOpen(true)
              setActive(-1)
              if (value) emit(null)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            className="block w-full truncate bg-transparent text-[17px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-mute"
          />
        </div>
        {searching && <SpinnerGap size={18} className="shrink-0 animate-spin text-mute" aria-label="Searching" />}
        {text && !searching && (
          <button
            type="button"
            onClick={() => {
              setText('')
              emit(null)
              inputRef.current?.focus()
            }}
            className="grid size-9 shrink-0 place-items-center rounded-full text-mute transition-colors hover:bg-soft hover:text-ink"
            aria-label={`Clear ${label}`}
          >
            <XCircle size={20} weight="fill" />
          </button>
        )}
        {allowLocation && !text && (
          <button
            type="button"
            onClick={locateMe}
            disabled={locate === 'locating'}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-soft px-3 text-sm font-medium text-ink transition-colors hover:bg-pressed disabled:opacity-60"
          >
            {locate === 'locating' ? (
              <SpinnerGap size={16} className="animate-spin" aria-hidden />
            ) : (
              <Crosshair size={16} weight="bold" aria-hidden />
            )}
            <span>{locate === 'locating' ? 'Locating' : 'My location'}</span>
          </button>
        )}
      </div>

      {message && (
        <p id={`${id}-msg`} role="alert" className="px-11 pb-2 text-sm text-bad">
          {message}
        </p>
      )}

      <ul
        id={listId}
        role="listbox"
        aria-label={`${label} suggestions`}
        className={`absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-2xl bg-surface py-1.5 shadow-float ring-1 ring-line ${
          listVisible ? 'animate-fade' : 'hidden'
        }`}
      >
        {items.map((item, i) => {
          const selected = i === active
          if (item.kind === 'locate') {
            return (
              <li
                key="locate"
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => e.preventDefault()}
                onClick={locateMe}
                className={`mx-1.5 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${selected ? 'bg-soft' : ''}`}
              >
                <span className="grid size-8 place-items-center rounded-full bg-ink text-inverse">
                  <NavigationArrow size={16} weight="fill" />
                </span>
                <span className="font-medium">Use my current location</span>
              </li>
            )
          }
          const { main, rest } = splitName(item.place.name)
          return (
            <li
              key={`${item.place.name}-${item.place.lat}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={selected}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item.place)}
              onMouseEnter={() => setActive(i)}
              className={`mx-1.5 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${selected ? 'bg-soft' : ''}`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-soft">
                <PlaceIcon type={item.place.type} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{main}</span>
                {rest && <span className="block truncate text-sm text-body">{rest}</span>}
              </span>
            </li>
          )
        })}
        {items.length === 0 && (
          <li className="px-4 py-3 text-sm text-body" role="presentation">
            {searchError ? "Search isn't responding. Try again." : `No places match "${query}".`}
          </li>
        )}
      </ul>
    </div>
  )
}
