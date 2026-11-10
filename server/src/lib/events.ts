/** Tiny in-process publish/subscribe used to push live updates to the dashboard (Server-Sent Events). */
export interface AppEvent {
  type: 'attendance' | 'late_checkin'
  data: Record<string, unknown>
}

type Listener = (event: AppEvent) => void

export class EventHub {
  private listeners = new Set<Listener>()

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  publish(event: AppEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // A broken client must never affect the others.
      }
    }
  }

  get size(): number {
    return this.listeners.size
  }
}
