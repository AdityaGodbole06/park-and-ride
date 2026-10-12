import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { NearbySpot, TripOption } from './types'

interface SpotsState {
  /** Spots for an option, including ones added or confirmed this session. */
  spotsFor: (option: TripOption) => NearbySpot[]
  setSpots: (carparkId: string, spots: NearbySpot[]) => void
  selectedId: string | null
  select: (id: string | null) => void
  addingFor: TripOption | null
  startAdding: (option: TripOption | null) => void
  /** Spots reported this session; hidden everywhere, including as suggestions. */
  removed: string[]
  remove: (id: string) => void
}

const Ctx = createContext<SpotsState | null>(null)

export function SpotsProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, NearbySpot[]>>({})
  const [selectedId, select] = useState<string | null>(null)
  const [addingFor, startAdding] = useState<TripOption | null>(null)
  const [removed, setRemoved] = useState<string[]>([])
  const remove = useCallback((id: string) => setRemoved((r) => (r.includes(id) ? r : [...r, id])), [])

  const spotsFor = useCallback(
    (option: TripOption) =>
      (overrides[option.carpark.id] ?? option.nearby_parking ?? []).filter((s) => !removed.includes(s.id)),
    [overrides, removed],
  )
  const setSpots = useCallback((carparkId: string, spots: NearbySpot[]) => {
    setOverrides((prev) => ({ ...prev, [carparkId]: spots }))
  }, [])

  const value = useMemo(
    () => ({ spotsFor, setSpots, selectedId, select, addingFor, startAdding, removed, remove }),
    [spotsFor, setSpots, selectedId, addingFor, removed, remove],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSpots() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSpots outside SpotsProvider')
  return v
}
