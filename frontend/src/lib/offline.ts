import { api, ApiError } from './api'

/**
 * Offline counting: when the internet drops in the middle of a count, offerings are kept on this
 * computer and sent as soon as the connection is back. Each one carries a reference
 * ("offline:<uuid>") so the server never saves the same envelope twice, even if it is sent again.
 */
export interface Pending { ref: string; body: Record<string, unknown>; savedAt: string; error?: string }

const KEY = 'sanctuary.offline.queue'
const listeners = new Set<() => void>()
let cache: Pending[] | null = null

function load(): Pending[] {
  if (cache) return cache
  try { cache = JSON.parse(localStorage.getItem(KEY) || '[]') } catch { cache = [] }
  return cache!
}
function save(list: Pending[]) {
  cache = list
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* storage full or private: keep in memory */ }
  listeners.forEach((l) => l())
}

export const pendingOfferings = () => load()
export function subscribePending(fn: () => void) {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; fn() } }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage) }
}

const newRef = () => `offline:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'network'

/** Saves a new offering, or keeps it for later when there is no connection. */
export async function createOffering(body: Record<string, unknown>): Promise<{ queued: boolean }> {
  const withRef = { ...body, external_ref: (body.external_ref as string) || newRef() }
  try {
    await api.post('/offerings', withRef)
    return { queued: false }
  } catch (e) {
    if (!isNetwork(e)) throw e
    save([...load(), { ref: withRef.external_ref as string, body: withRef, savedAt: new Date().toISOString() }])
    return { queued: true }
  }
}

let flushing: Promise<number> | null = null
/** Sends everything that was kept offline. Returns how many were saved. */
export function flushPending(): Promise<number> {
  flushing ??= (async () => {
    let sent = 0
    for (const p of [...load()]) {
      try {
        await api.post('/offerings', p.body)
        sent++
        save(load().filter((x) => x.ref !== p.ref))
      } catch (e) {
        if (isNetwork(e)) break
        // The server refused it (for example the count was closed meanwhile): keep it, with the reason.
        save(load().map((x) => (x.ref === p.ref ? { ...x, error: e instanceof ApiError ? e.code : 'server_error' } : x)))
      }
    }
    return sent
  })().finally(() => { flushing = null })
  return flushing
}

export const discardPending = (ref: string) => save(load().filter((x) => x.ref !== ref))
