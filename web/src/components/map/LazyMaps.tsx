import { lazy, Suspense } from 'react'
import type { SpotMapProps } from './SpotMap'

// Leaflet is the heaviest dependency; load it only when a map is on screen.
const SpotMapImpl = lazy(() => import('./SpotMap').then((m) => ({ default: m.SpotMap })))
const OverviewMapImpl = lazy(() => import('./OverviewMap').then((m) => ({ default: m.OverviewMap })))

function MapFallback({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-soft ${className}`} aria-hidden />
}

export function SpotMap(props: SpotMapProps) {
  return (
    <Suspense fallback={<MapFallback className={props.className} />}>
      <SpotMapImpl {...props} />
    </Suspense>
  )
}

export function OverviewMap() {
  return (
    <Suspense fallback={<MapFallback className="size-full rounded-none" />}>
      <OverviewMapImpl />
    </Suspense>
  )
}
