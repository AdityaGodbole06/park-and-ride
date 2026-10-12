import type { Carpark, NearbySpot, NewSpot, Place, PlanQuery, PlanResponse, ReportReason } from './types'

const BASE = '/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, init)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, "Can't reach the planner. Check your connection and try again.")
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
      // FastAPI validation errors: [{ loc, msg }]
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('. ')
    } catch {
      /* not JSON */
    }
    if (res.status >= 500 || res.status === 0) {
      throw new ApiError(res.status, detail || 'The planner had a problem. Try again in a moment.')
    }
    throw new ApiError(res.status, detail || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export function searchPlaces(q: string, signal?: AbortSignal) {
  return request<Place[]>(`/places?q=${encodeURIComponent(q)}`, { signal })
}

export async function getPlan(query: PlanQuery, signal?: AbortSignal): Promise<PlanResponse> {
  const params = new URLSearchParams({
    from: `${query.from.lat},${query.from.lon}`,
    to: `${query.to.lat},${query.to.lon}`,
  })
  if (query.timeMode === 'arrive_by') params.set('arrive_by', query.time)
  if (query.timeMode === 'depart_at') params.set('depart_at', query.time)
  return request<PlanResponse>(`/plan?${params}`, { signal })
}

export function getCarparks(signal?: AbortSignal) {
  return request<Carpark[]>('/carparks', { signal })
}

export function getNearby(carpark: Carpark, signal?: AbortSignal) {
  return request<NearbySpot[]>(`/carparks/${encodeURIComponent(carpark.id)}/nearby`, { signal })
}

export function createSpot(body: NewSpot) {
  return request<NearbySpot>('/spots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function confirmSpot(spot: NearbySpot) {
  return request<NearbySpot>(`/spots/${encodeURIComponent(spot.id)}/confirm`, { method: 'POST' })
}

export function reportSpot(spot: NearbySpot, reason: ReportReason, details?: string) {
  return request<{ ok: boolean }>(`/spots/${encodeURIComponent(spot.id)}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details ? { reason, details } : { reason }),
  })
}
