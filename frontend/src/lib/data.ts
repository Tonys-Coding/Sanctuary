import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { Batch, Fund, Goal, Member } from './types'

// Shared lists used on many screens.
export const useMembers = () => useQuery({ queryKey: ['members'], queryFn: () => api.get<Member[]>('/members') })
export const useFunds = (all = false) => useQuery({ queryKey: ['funds', all], queryFn: () => api.get<Fund[]>(`/funds${all ? '?all=1' : ''}`) })
export const useBatches = () => useQuery({ queryKey: ['batches'], queryFn: () => api.get<Batch[]>('/batches') })
export const useGoals = () => useQuery({ queryKey: ['goals'], queryFn: () => api.get<Goal[]>('/goals') })

/** After any change to offerings, every total on screen may be stale: refresh them all. */
export function useRefreshAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}
