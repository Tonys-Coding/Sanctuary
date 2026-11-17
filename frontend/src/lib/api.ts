/** Small fetch wrapper. Errors carry a `code` that lib/errors.ts turns into a friendly sentence. */
export class ApiError extends Error {
  status: number
  code: string
  detail: unknown
  constructor(status: number, code: string, detail?: unknown) {
    super(code)
    this.status = status
    this.code = code
    this.detail = detail
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body && !isForm ? { 'content-type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(res.status, data.error || 'server_error', data.detail)
  }
  return (res.headers.get('content-type') || '').includes('json') ? res.json() : (res.blob() as Promise<T>)
}

export const api = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T = any>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T = any>(path: string) => request<T>('DELETE', path),
  upload: <T = any>(path: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<T>('POST', path, form)
  },
}

export const fileUrl = (name?: string | null) => (name ? `/api/files/${name}` : undefined)

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Downloads a generated file (PDF / CSV) from a GET or POST endpoint. */
export async function download(path: string, filename: string, body?: unknown) {
  const blob = body === undefined ? await api.get<Blob>(path) : await api.post<Blob>(path, body)
  saveBlob(blob, filename)
}

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}
