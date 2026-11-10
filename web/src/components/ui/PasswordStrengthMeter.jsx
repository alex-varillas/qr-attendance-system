import { scorePassword } from '../../utils/passwordStrength'
import { t } from '../../i18n'

export default function PasswordStrengthMeter({ password }) {
  if (!password) return null

  const { score, label, colorClass, checks } = scorePassword(password)
  const bars = [0, 1, 2, 3]

  const tip = !checks.length8
    ? t('Usa al menos 8 caracteres.')
    : !(checks.lower && checks.upper)
      ? t('Combina mayúsculas y minúsculas.')
      : !checks.digit
        ? t('Agrega al menos un número.')
        : null

  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {bars.map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colorClass : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-slate-500">{label}</span>
        {tip && <span className="text-xs text-slate-400">{tip}</span>}
      </div>
    </div>
  )
}
