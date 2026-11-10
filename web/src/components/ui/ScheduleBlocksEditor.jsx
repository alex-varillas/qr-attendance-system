import { t } from '../../i18n'
import { weekdayInitials } from '../../utils/dates'
import { EMPTY_BLOCK } from '../../utils/scheduleBlocks'
// Editor reutilizable de bloques de horario.
// Un "bloque" = un grupo de días con su entrada/salida y, opcionalmente, un corte
// (refrigerio o jornada partida). Usado en Configuración (horario de empresa) y en
// la ficha del empleado (horario personalizado).

// The one-letter labels follow the language of the interface (L M X J V S D, or M T W T F S S).
const dayInitial = day => weekdayInitials()[(day + 6) % 7]
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map(day => ({ day, get label() { return dayInitial(day) } }))

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
              <span className="text-xs font-semibold text-slate-600">{t('Bloque')}{' '}{i + 1}</span>
              {blocks.length > 1 && (
                <button type="button" onClick={() => removeBlock(i)}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium">
                  {t('Quitar')}
                </button>
              )}
            </div>

            <label className="block text-xs font-medium text-slate-700 mb-2">{t('Días')}</label>
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
                <label className="block text-xs font-medium text-slate-700 mb-1">{t('Entrada')}</label>
                <input type="time" value={block.start_time}
                  onChange={e => updateBlock(i, { start_time: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t('Salida')}</label>
                <input type="time" value={block.end_time}
                  onChange={e => updateBlock(i, { end_time: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            </div>

            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input type="checkbox" checked={block.has_break}
                onChange={e => updateBlock(i, { has_break: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-xs font-medium text-slate-700">{t('Refrigerio o jornada partida (corte intermedio)')}</span>
            </label>
            {block.has_break && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t('Inicio del corte')}</label>
                  <input type="time" value={block.break_start}
                    onChange={e => updateBlock(i, { break_start: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t('Fin del corte')}</label>
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
        {t('+ Agregar bloque')}
      </button>
    </>
  )
}
