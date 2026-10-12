import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents, ZoomControl } from 'react-leaflet'
import type { Carpark, NearbySpot, ParkingStatus } from '../../lib/types'

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

interface LatLon {
  lat: number
  lon: number
}

const statusRing: Record<ParkingStatus, string> = {
  available: 'ring-ok',
  filling: 'ring-warn',
  full: 'ring-bad',
  unknown: 'ring-mute',
}

function carparkIcon(status: ParkingStatus) {
  return L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="grid size-[34px] place-items-center rounded-lg bg-ink font-sans text-[15px] font-bold text-inverse shadow-float ring-[3px] ${statusRing[status]}">P</div>`,
  })
}

function spotIcon(index: number, spot: NearbySpot, selected: boolean, suggested: boolean) {
  const base = suggested || selected ? 'bg-ink text-inverse' : 'bg-surface text-ink'
  const shape = spot.source === 'community' ? 'rounded-md rotate-45' : 'rounded-full'
  const inner = spot.source === 'community' ? '-rotate-45' : ''
  const scale = selected ? 'scale-125' : ''
  return L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div class="grid size-[26px] place-items-center ${shape} ${base} ${scale} font-mono text-[12px] font-semibold shadow-float ring-2 ring-ink transition-transform"><span class="${inner}">${index + 1}</span></div>`,
  })
}

const originIcon = L.divIcon({
  className: '',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html: '<div class="size-[18px] rounded-full bg-ink ring-4 ring-surface shadow-float"></div>',
})

const pickIcon = L.divIcon({
  className: '',
  iconSize: [30, 40],
  iconAnchor: [15, 38],
  html: '<svg viewBox="0 0 30 40" width="30" height="40" aria-hidden="true"><path d="M15 1C7.3 1 1 7.1 1 14.7 1 25 15 39 15 39s14-14 14-24.3C29 7.1 22.7 1 15 1z" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/><circle cx="15" cy="14.5" r="5" fill="var(--surface)"/></svg>',
})

function FitTo({ points, padding }: { points: LatLon[]; padding: number }) {
  const map = useMap()
  const key = points.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join('|')
  useEffect(() => {
    if (!points.length) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 16)
      return
    }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])), {
      padding: [padding, padding],
      maxZoom: 17,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map, padding])
  return null
}

function FlyToSpot({ spot }: { spot: LatLon | null }) {
  const map = useMap()
  useEffect(() => {
    if (spot) map.panTo([spot.lat, spot.lon], { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches })
  }, [spot, map])
  return null
}

function PickHandler({ onPick }: { onPick: (p: LatLon) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: Number(e.latlng.lat.toFixed(6)), lon: Number(e.latlng.lng.toFixed(6)) })
    },
  })
  return null
}

/** Keeps Leaflet's size right when the container animates or appears. */
function InvalidateOnResize() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])
  return null
}

export interface SpotMapProps {
  carpark: Carpark
  spots: NearbySpot[]
  suggestedId?: string | null
  selectedId?: string | null
  onSelect?: (id: string) => void
  origin?: LatLon | null
  className?: string
  /** Add-spot mode: tap the map to drop a pin. */
  picked?: LatLon | null
  onPick?: (p: LatLon) => void
  label: string
  zoomPosition?: 'topleft' | 'bottomright'
}

export function SpotMap({
  carpark,
  spots,
  suggestedId,
  selectedId,
  onSelect,
  origin,
  className = '',
  picked,
  onPick,
  label,
  zoomPosition = 'topleft',
}: SpotMapProps) {
  const points = useMemo(
    () => [carpark, ...(onPick ? [] : spots), ...(origin ? [origin] : [])],
    [carpark, spots, origin, onPick],
  )
  const selected = spots.find((s) => s.id === selectedId) ?? null

  return (
    <div className={`relative isolate overflow-hidden rounded-2xl bg-soft ${className}`} role="region" aria-label={label}>
      <MapContainer
        center={[carpark.lat, carpark.lon]}
        zoom={16}
        scrollWheelZoom={false}
        attributionControl
        zoomControl={false}
        className={`size-full ${onPick ? 'cursor-crosshair' : ''}`}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={OSM_ATTRIBUTION} maxZoom={19} />
        <ZoomControl position={zoomPosition} />
        <InvalidateOnResize />
        <FitTo points={points} padding={onPick ? 20 : 36} />
        {!onPick && <FlyToSpot spot={selected} />}
        {onPick && <PickHandler onPick={onPick} />}

        {origin && (
          <Marker position={[origin.lat, origin.lon]} icon={originIcon} keyboard={false}>
            <Tooltip direction="top" offset={[0, -10]}>
              Start
            </Tooltip>
          </Marker>
        )}

        <Marker position={[carpark.lat, carpark.lon]} icon={carparkIcon(carpark.status)} keyboard={false} zIndexOffset={500}>
          <Tooltip direction="top" offset={[0, -16]}>
            {carpark.name} commuter car park
          </Tooltip>
        </Marker>

        {!onPick &&
          spots.map((spot, i) => (
            <Marker
              key={spot.id}
              position={[spot.lat, spot.lon]}
              icon={spotIcon(i, spot, spot.id === selectedId, spot.id === suggestedId)}
              keyboard={false}
              zIndexOffset={spot.id === selectedId ? 1000 : spot.id === suggestedId ? 800 : -i}
              eventHandlers={onSelect ? { click: () => onSelect(spot.id) } : undefined}
            >
              <Tooltip direction="top" offset={[0, -12]}>
                {spot.name}, {spot.walk_minutes} min walk
              </Tooltip>
            </Marker>
          ))}

        {picked && <Marker position={[picked.lat, picked.lon]} icon={pickIcon} keyboard={false} />}
      </MapContainer>
    </div>
  )
}
