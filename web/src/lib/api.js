import { t } from '../i18n/index.js'
import { serverMessage } from '../i18n/serverMessages'
// Thin client for the server API. The app and the API share one address, so the browser sends the
// session cookie by itself: no token is ever stored in JavaScript.

export class ApiError extends Error {
  constructor(status, message, code, body) {
    super(serverMessage(message))
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

let unauthorizedHandler = null

/** Called when the server says the session is gone (expired, signed out elsewhere, account deactivated). */
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

function toQuery(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

async function request(method, path, { body, query, form, signal } = {}) {
  const headers = {}
  let payload
  if (form) {
    payload = form // the browser sets the multipart boundary itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(`/api${path}${toQuery(query)}`, { method, headers, body: payload, credentials: 'same-origin', signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError(0, t('No se pudo conectar con el servidor'), 'network')
  }

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    // A 401 on the sign-in itself just means a wrong password; anywhere else it means the session ended.
    if (response.status === 401 && !path.startsWith('/auth/login') && unauthorizedHandler) unauthorizedHandler()
    throw new ApiError(response.status, data?.error ?? response.statusText, data?.code, data)
  }
  return data
}

export const api = {
  get: (path, query, options) => request('GET', path, { query, ...options }),
  post: (path, body, options) => request('POST', path, { body: body ?? {}, ...options }),
  put: (path, body, options) => request('PUT', path, { body: body ?? {}, ...options }),
  patch: (path, body, options) => request('PATCH', path, { body: body ?? {}, ...options }),
  delete: (path, query, options) => request('DELETE', path, { query, ...options }),
  /** Sends a file (and optional text fields) as multipart form data. */
  upload: (method, path, file, fields = {}) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) form.append(key, String(value))
    }
    form.append('file', file)
    return request(method, path, { form })
  },
}
