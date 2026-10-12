// Types mirror docs/API.md.

export type PlaceType = 'stop' | 'street' | 'poi' | 'suburb' | 'singlehouse' | (string & {})

export interface Place {
  name: string
  type: PlaceType
  lat: number
  lon: number
}

export type ParkingStatus = 'available' | 'filling' | 'full' | 'unknown'

export interface Carpark {
  id: string
  name: string
  suburb: string
  lat: number
  lon: number
  capacity: number | null
  free: number | null
  status: ParkingStatus
  reading_at: string | null
  /** How parking works here, e.g. the Opal tap-on rule. Not a warning. */
  tip?: string | null
}

export type LegMode =
  | 'walk'
  | 'train'
  | 'metro'
  | 'light rail'
  | 'bus'
  | 'coach'
  | 'ferry'
  | 'school bus'
  | 'transport'
  | (string & {})

export interface Leg {
  mode: LegMode
  line: string | null
  from: string
  to: string
  depart: string
  arrive: string
}

export type SpotAccess = 'public' | 'customers' | 'unknown'

export interface NearbySpot {
  id: string
  name: string
  kind: string
  source: 'osm' | 'community'
  lat: number
  lon: number
  walk_minutes: number
  capacity: number | null
  access: SpotAccess
  fee: 'free' | 'paid' | null
  max_stay: string | null
  notes: string | null
  confirmations: number
  /** Private-land warning for customers-only / unknown-access / community spots. */
  warning?: string | null
  /** Community spots only. */
  last_confirmed_at?: string | null
}

export interface SuggestedSpot extends NearbySpot {
  /** How much longer the walk is than from the official car park. */
  extra_walk_minutes?: number
}

export interface TripOption {
  carpark: Carpark
  parking_status: ParkingStatus
  leave_at: string
  drive_minutes: number
  arrive_carpark_at: string
  depart_carpark_at: string
  arrive_at: string
  total_minutes: number
  legs: Leg[]
  warnings: string[]
  /** Optional so older backends still render. */
  nearby_parking?: NearbySpot[]
  suggested_spot?: SuggestedSpot | null
}

export interface PlanResponse {
  mode: 'arrive_by' | 'depart_at'
  time: string
  drive_times: string
  carparks_considered: string[]
  options: TripOption[]
}

export type TimeMode = 'now' | 'depart_at' | 'arrive_by'

export interface PlanQuery {
  from: Place
  to: Place
  timeMode: TimeMode
  /** HH:MM, ignored when timeMode is 'now'. */
  time: string
}

export interface NewSpot {
  carpark_id: string
  name: string
  lat: number
  lon: number
  notes?: string
}

export type ReportReason = 'wrong_info' | 'not_allowed' | 'owner_request' | 'other'
