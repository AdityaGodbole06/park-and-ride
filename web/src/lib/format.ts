import type { Leg, NearbySpot, ParkingStatus, SuggestedSpot, TripOption } from './types'

/**
 * API times look like "2026-10-14T07:25+11:00" and are already Sydney wall
 * time, so read the clock straight from the string. That keeps the display
 * right even when the device is in another time zone.
 */
export function clock(iso: string): { time: string; period: 'am' | 'pm' } {
  const m = /T(\d{2}):(\d{2})/.exec(iso)
  if (!m) return { time: '--:--', period: 'am' }
  const h = Number(m[1])
  const period = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return { time: `${h12}:${m[2]}`, period }
}

export function clockText(iso: string) {
  const { time, period } = clock(iso)
  return `${time}${period}`
}

export function minutesFromNow(iso: string, now = Date.now()) {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.round((t - now) / 60_000)
}

export function relativeLeave(iso: string, now = Date.now()): string | null {
  const mins = minutesFromNow(iso, now)
  if (mins === null) return null
  if (mins < -1) return `${-mins} min ago`
  if (mins <= 1) return 'Leave now'
  if (mins < 60) return `in ${mins} min`
  const sydneyDay = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
  const target = Date.parse(iso)
  if (sydneyDay(target) === sydneyDay(now)) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m ? `in ${h} h ${m} min` : `in ${h} h`
  }
  if (sydneyDay(target) === sydneyDay(now + 86_400_000)) return 'Tomorrow'
  return new Date(target).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'Australia/Sydney' })
}

export function duration(mins: number) {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function legMinutes(leg: Pick<Leg, 'depart' | 'arrive'>) {
  return Math.max(0, Math.round((Date.parse(leg.arrive) - Date.parse(leg.depart)) / 60_000))
}

/** "Cherrybrook Station, Platform 1, Cherrybrook" -> "Cherrybrook Station" */
export function shortStop(name: string) {
  return name.split(',')[0].trim()
}

export function platform(name: string) {
  const m = /Platform\s+(\w+)/i.exec(name)
  return m ? `Platform ${m[1]}` : null
}

export const transitModes = new Set(['train', 'metro', 'light rail', 'bus', 'coach', 'ferry', 'school bus', 'transport'])

export function firstTransitLeg(option: TripOption) {
  return option.legs.find((l) => transitModes.has(l.mode))
}

export function modeNoun(mode: string) {
  switch (mode) {
    case 'metro':
      return 'Metro'
    case 'train':
      return 'train'
    case 'light rail':
      return 'light rail'
    case 'bus':
    case 'school bus':
      return 'bus'
    case 'coach':
      return 'coach'
    case 'ferry':
      return 'ferry'
    default:
      return 'service'
  }
}

/** "Drive 14 min to Kellyville, then M1 at 7:46, arrive 8:31" */
export function decisionSentence(option: TripOption) {
  const transit = firstTransitLeg(option)
  const spot = option.suggested_spot
  const first = option.legs[0]
  const parts = spot
    ? [`Drive ${option.drive_minutes} min to ${spotInSentence(spot.name)}`]
    : [`Drive ${option.drive_minutes} min to ${option.carpark.name}`]
  if (spot && first?.mode === 'walk') parts.push(`walk ${legMinutes(first)} min`)
  if (transit) {
    const label = transit.line ?? modeNoun(transit.mode)
    parts.push(`then ${label} at ${clockText(transit.depart)}`)
  }
  parts.push(`arrive ${clockText(option.arrive_at)}`)
  return parts.join(', ')
}

export const statusCopy: Record<ParkingStatus, { label: string; short: string }> = {
  available: { label: 'Spaces available', short: 'Available' },
  filling: { label: 'Filling up', short: 'Filling' },
  full: { label: 'Car park full', short: 'Full' },
  unknown: { label: 'Parking unknown', short: 'Unknown' },
}

export function haversineMetres(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Shift an API timestamp by `minutes`, keeping its UTC offset. */
export function shiftIso(iso: string, minutes: number) {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(iso)
  const t = Date.parse(iso)
  if (!m || Number.isNaN(t)) return iso
  const offset = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
  const wall = new Date(t + (minutes + offset) * 60_000).toISOString().slice(0, 16)
  return `${wall}${m[0]}`
}

export interface SuggestionPlan {
  spot: SuggestedSpot
  /** Extra minutes on foot compared with parking at the station car park. */
  extraMinutes: number
  /** Real walk from the spot to the station: the backend plans the legs from the spot. */
  walkMinutes: number
}

/** The backend's suggested alternative, with how much extra walking it adds. */
export function suggestionPlan(option: TripOption): SuggestionPlan | null {
  const spot = option.suggested_spot
  if (!spot) return null
  let extraMinutes = spot.extra_walk_minutes
  if (extraMinutes === undefined) {
    const first = option.legs[0]
    const stationWalk = first && first.mode === 'walk' ? legMinutes(first) : 0
    extraMinutes = spot.walk_minutes - stationWalk
  }
  extraMinutes = Math.max(0, Math.round(extraMinutes))
  const first = option.legs[0]
  const walkMinutes = first && first.mode === 'walk' ? legMinutes(first) : spot.walk_minutes
  return { spot, extraMinutes, walkMinutes }
}

export const accessCopy: Record<NearbySpot['access'], string> = {
  public: 'Public',
  customers: 'Customers only',
  unknown: 'Access unknown',
}

export function feeCopy(fee: NearbySpot['fee']) {
  return fee === 'free' ? 'Free' : fee === 'paid' ? 'Paid' : 'Fee unknown'
}

/** Generic OSM names read badly mid-sentence: "Park at Public car park". */
export function spotInSentence(name: string) {
  return /^(public|customer|unnamed) car park$/i.test(name.trim()) ? `a ${name.trim().toLowerCase()}` : name
}
