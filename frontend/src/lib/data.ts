import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'
import type { Batch, Fund, Goal, Member } from './types'

/**
 * Loads a list and keeps a slim copy on this computer, used only when the server cannot be reached,
 * so offerings can still be recorded offline. The copy is removed on sign-out.
 */
async function withOfflineCopy<T>(key: string, load: () => Promise<T[]>, slim: (x: T) => Partial<T>): Promise<T[]> {
  try {
    const rows = await load()
    try { localStorage.setItem(key, JSON.stringify(rows.map(slim))) } catch { /* storage full or private */ }
    return rows
  } catch (e) {
    if (e instanceof ApiError && e.code === 'network') {
      try { const cached = JSON.parse(localStorage.getItem(key) || 'null'); if (cached) return cached as T[] } catch { /* nothing usable */ }
    }
    throw e
  }
}

// Shared lists used on many screens.
export const useMembers = () => useQuery({
  queryKey: ['members'],
  queryFn: () => withOfflineCopy('sanctuary.offline.members', () => api.get<Member[]>('/members'),
    (m) => ({ id: m.id, first_name: m.first_name, last_name: m.last_name, full_name: m.full_name, envelope_number: m.envelope_number, avatar_file: m.avatar_file, status: m.status, spark: [] as number[] })),
})
export const useFunds = (all = false) => useQuery({
  queryKey: ['funds', all],
  queryFn: () => all ? api.get<Fund[]>('/funds?all=1') : withOfflineCopy('sanctuary.offline.funds', () => api.get<Fund[]>('/funds'), (f) => ({ id: f.id, name: f.name, color_slot: f.color_slot, tax_deductible: f.tax_deductible })),
})
export const useBatches = () => useQuery({ queryKey: ['batches'], queryFn: () => api.get<Batch[]>('/batches') })
export const useGoals = () => useQuery({ queryKey: ['goals'], queryFn: () => api.get<Goal[]>('/goals') })

/** After any change to offerings, every total on screen may be stale: refresh them all. */
export function useRefreshAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}
