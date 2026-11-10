// Editor reutilizable de bloques de horario.
// Un "bloque" = un grupo de días con su entrada/salida y, opcionalmente, un corte
// (refrigerio o jornada partida). Usado en Configuración (horario de empresa) y en
// la ficha del empleado (horario personalizado).

const DAY_OPTIONS = [
  { day: 1, label: 'L' }, { day: 2, label: 'M' }, { day: 3, label: 'X' },
  { day: 4, label: 'J' }, { day: 5, label: 'V' }, { day: 6, label: 'S' }, { day: 0, label: 'D' },
]

export const EMPTY_BLOCK = {
  days_of_week: [1, 2, 3, 4, 5],
  start_time: '08:00', end_time: '18:00',
  has_break: true, break_start: '13:00', break_end: '14:00',
}

// Filas de la BD (schedules) → bloques del formulario
export function schedulesToBlocks(rows) {
  return rows.map(s => ({
    days_of_week: s.days_of_week ?? [],
    start_time:   s.start_time?.slice(0, 5) ?? '08:00',
    end_time:     s.end_time?.slice(0, 5)   ?? '18:00',
    has_break:    !!(s.break_start && s.break_end),
    break_start:  s.break_start?.slice(0, 5) ?? '13:00',
    break_end:    s.break_end?.slice(0, 5)   ?? '14:00',
  }))
}

// Bloques del formulario → payload del RPC set_horarios
export function blocksToPayload(blocks) {
  return blocks.map(b => ({
    days_of_week: b.days_of_week,
    start_time:   b.start_time,
    end_time:     b.end_time,
    break_start:  b.has_break ? (b.break_start || null) : null,
    break_end:    b.has_break ? (b.break_end || null) : null,
  }))
}

// Valida los bloques. Devuelve un mensaje de error o null si todo OK.
export function validateBlocks(blocks) {
  const seen = new Set()
  for (const b of blocks) {
    if (!b.days_of_week.length) return 'Cada bloque de horario debe tener al menos un día.'
    if (!b.start_time || !b.end_time) return 'Cada bloque debe tener hora de entrada y salida.'
    if (b.has_break && (!b.break_start || !b.break_end)) return 'Completa el inicio y fin del corte/refrigerio, o desactívalo.'
    for (const d of b.days_of_week) {
      if (seen.has(d)) return 'Un día no puede estar en más de un bloque de horario.'
      seen.add(d)
    }
  }
  return null
}

export default function ScheduleBlocksEditor({ blocks, onChange }) {
  function updateBlock(i, patch) {
    onChange(blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }
  function toggleBlockDay(i, day) {
    onChange(blocks.map((b, idx) => {
      if (idx !== i) return b
      const days = b.days_of_week.includes(day)
        ? b.days_of_week.filter(d => d !== day)
        : [...b.days_of_week, day].sort((a, c) => a - c)
      return { ...b, days_of_week: days }
    }))
  }
  function addBlock() {
    onChange([...blocks, { ...EMPTY_BLOCK, days_of_week: [6], has_break: false }])
  }
  function removeBlock(i) {
    onChange(blocks.filter((_, idx) => idx !== i))
  }

  return (
    <>
      <div className="space-y-4">
        {blocks.map((block, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-600">Bloque {i + 1}</span>
              {blocks.length > 1 && (
                <button type="button" onClick={() => removeBlock(i)}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium">
                  Quitar
                </button>
              )}
            </div>

            <label className="block text-xs font-medium text-slate-700 mb-2">Días</label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {DAY_OPTIONS.map(({ day, label }) => {
                const active = block.days_of_week.includes(day)
                return (
                  <button key={day} type="button" onClick={() => toggleBlockDay(i, day)}
                    className={`w-11 h-11 sm:w-9 sm:h-9 rounded-lg text-xs font-semibold transition-colors ${
                      active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}>
                    {label}
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Entrada</label>
                <input type="time" value={block.start_time}
                  onChange={e => updateBlock(i, { start_time: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Salida</label>
                <input type="time" value={block.end_time}
                  onChange={e => updateBlock(i, { end_time: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            </div>

            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input type="checkbox" checked={block.has_break}
                onChange={e => updateBlock(i, { has_break: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-xs font-medium text-slate-700">Refrigerio o jornada partida (corte intermedio)</span>
            </label>
            {block.has_break && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Inicio del corte</label>
                  <input type="time" value={block.break_start}
                    onChange={e => updateBlock(i, { break_start: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fin del corte</label>
                  <input type="time" value={block.break_end}
                    onChange={e => updateBlock(i, { break_end: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={addBlock}
        className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
        + Agregar bloque
      </button>
    </>
  )
}
