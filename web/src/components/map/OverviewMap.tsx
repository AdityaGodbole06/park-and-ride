import L from 'leaflet'
import { useEffect, useState } from 'react'
import { MapContainer, Marker, TileLayer, Tooltip, ZoomControl } from 'react-leaflet'
import { getCarparks } from '../../lib/api'
import { clockText, statusCopy } from '../../lib/format'
import type { Carpark, ParkingStatus } from '../../lib/types'
import { OSM_ATTRIBUTION } from './SpotMap'

const dot: Record<ParkingStatus, string> = {
  available: 'bg-ok',
  filling: 'bg-warn',
  full: 'bg-bad',
  unknown: 'bg-mute',
}

function icon(status: ParkingStatus) {
  return L.divIcon({
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<div class="size-4 rounded-full ${dot[status]} ring-[3px] ring-surface shadow-float"></div>`,
  })
}

/** Desktop idle state: every commuter car park with its live status. */
export function OverviewMap() {
  const [carparks, setCarparks] = useState<Carpark[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    getCarparks(ctrl.signal)
      .then(setCarparks)
      .catch((e) => {
        if (e?.name !== 'AbortError') setFailed(true)
      })
    return () => ctrl.abort()
  }, [])

  const counts = carparks.reduce<Record<ParkingStatus, number>>(
    (acc, c) => ({ ...acc, [c.status]: acc[c.status] + 1 }),
    { available: 0, filling: 0, full: 0, unknown: 0 },
  )

  return (
    <div className="relative isolate size-full" role="region" aria-label="Live commuter car parks map">
      <MapContainer center={[-33.8, 151.0]} zoom={11} scrollWheelZoom zoomControl={false} className="size-full">
        <ZoomControl position="bottomright" />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={OSM_ATTRIBUTION} maxZoom={19} />
        {carparks.map((c) => (
          <Marker key={c.id} position={[c.lat, c.lon]} icon={icon(c.status)} keyboard={false}>
            <Tooltip direction="top" offset={[0, -8]}>
              <strong>{c.name}</strong>
              <br />
              {statusCopy[c.status].short}
              {c.free !== null && c.capacity ? `, ${c.free} of ${c.capacity} free` : ''}
              {c.reading_at ? ` at ${clockText(c.reading_at)}` : ''}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute top-5 left-5 z-[1000] max-w-xs rounded-2xl bg-surface/95 p-4 shadow-float ring-1 ring-line backdrop-blur">
        <p className="text-sm font-semibold">Commuter car parks right now</p>
        {failed ? (
          <p className="mt-1 text-sm text-body">Live car park data is unavailable.</p>
        ) : carparks.length === 0 ? (
          <p className="mt-1 text-sm text-body">Loading live occupancy</p>
        ) : (
          <dl className="mt-3 grid grid-cols-3 gap-3">
            {(['available', 'filling', 'full'] as const).map((s) => (
              <div key={s}>
                <dt className="flex items-center gap-1.5 text-xs text-body">
                  <span className={`size-2 rounded-full ${dot[s]}`} aria-hidden />
                  {statusCopy[s].short}
                </dt>
                <dd className="mt-0.5 font-mono text-xl font-semibold tabular-nums">{counts[s]}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}
