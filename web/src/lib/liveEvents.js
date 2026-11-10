// One shared Server-Sent Events connection for the whole app. The server pushes an event the moment
// someone checks in; anything that wants to react subscribes here instead of opening its own connection.
//
// The connection is opened with the first subscriber and closed with the last one. The browser
// reconnects by itself after a network drop; when it does, `onReconnect` handlers run so the screens
// can refresh what they may have missed meanwhile.

let source = null
const handlers = new Map() // event type -> Set of functions
const reconnectHandlers = new Set()
let opened = false

function dispatch(type, event) {
  let data = null
  try {
    data = JSON.parse(event.data)
  } catch {
    return
  }
  for (const handler of handlers.get(type) ?? []) handler(data)
}

function ensureOpen() {
  if (source || typeof EventSource === 'undefined') return
  source = new EventSource('/api/events')
  source.addEventListener('open', () => {
    if (opened) for (const handler of reconnectHandlers) handler()
    opened = true
  })
  source.addEventListener('attendance', (event) => dispatch('attendance', event))
  // A refusal from the server (the session ended) closes the stream for good; nothing to retry.
  source.addEventListener('error', () => {
    if (source?.readyState === EventSource.CLOSED) closeIfIdle(true)
  })
}

function closeIfIdle(force = false) {
  const idle = [...handlers.values()].every((set) => set.size === 0) && reconnectHandlers.size === 0
  if ((idle || force) && source) {
    source.close()
    source = null
    opened = false
  }
}

/** Calls `handler(data)` for every event of `type` ("attendance"). Returns a function that unsubscribes. */
export function subscribeLive(type, handler) {
  if (!handlers.has(type)) handlers.set(type, new Set())
  handlers.get(type).add(handler)
  ensureOpen()
  return () => {
    handlers.get(type)?.delete(handler)
    closeIfIdle()
  }
}

/** Calls `handler()` when the connection comes back after a drop. Returns a function that unsubscribes. */
export function onLiveReconnect(handler) {
  reconnectHandlers.add(handler)
  ensureOpen()
  return () => {
    reconnectHandlers.delete(handler)
    closeIfIdle()
  }
}
