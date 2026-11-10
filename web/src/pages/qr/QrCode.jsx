import { useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { t } from '../../i18n'

export default function QrCode() {
  const { business } = useAuth()
  const qrRef = useRef(null)

  if (!business) return null

  const checkinUrl = `${window.location.origin}/checkin/${business.id}`

  function handleDownload() {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return

    const qrSize = 560
    const pad    = 48
    const W      = qrSize + pad * 2       // 656
    const H      = qrSize + pad * 2 + 120 // 776

    const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="10" fill="#2E7DE9"/>
      <rect x="10" y="10" width="18" height="18" rx="3" fill="white"/>
      <rect x="14" y="14" width="10" height="10" rx="1.5" fill="#2E7DE9"/>
      <rect x="17" y="17" width="4" height="4" rx="1" fill="white"/>
      <rect x="36" y="10" width="18" height="18" rx="3" fill="white"/>
      <rect x="40" y="14" width="10" height="10" rx="1.5" fill="#2E7DE9"/>
      <rect x="43" y="17" width="4" height="4" rx="1" fill="white"/>
      <rect x="10" y="36" width="18" height="18" rx="3" fill="white"/>
      <rect x="14" y="40" width="10" height="10" rx="1.5" fill="#2E7DE9"/>
      <rect x="17" y="43" width="4" height="4" rx="1" fill="white"/>
      <rect x="36" y="36" width="5" height="5" rx="1" fill="white"/>
      <rect x="43" y="36" width="5" height="5" rx="1" fill="white"/>
      <rect x="50" y="36" width="5" height="5" rx="1" fill="white"/>
      <rect x="36" y="43" width="5" height="5" rx="1" fill="white"/>
      <rect x="43" y="43" width="8" height="5" rx="1" fill="white"/>
      <rect x="36" y="50" width="8" height="5" rx="1" fill="white"/>
      <rect x="50" y="43" width="5" height="12" rx="1" fill="white"/>
      <rect x="44" y="50" width="5" height="5" rx="1" fill="white"/>
    </svg>`

    const loadImg = src => new Promise(res => {
      const i = new Image(); i.onload = () => res(i); i.src = src
    })
    const svgData = new XMLSerializer().serializeToString(svg)
    const qrSrc   = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
    const logoSrc = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(logoSvg)))

    Promise.all([loadImg(qrSrc), loadImg(logoSrc)]).then(([qrImg, logoImg]) => {
      const canvas = document.createElement('canvas')
      canvas.width  = W
      canvas.height = H
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)

      // QR
      ctx.drawImage(qrImg, pad, pad, qrSize, qrSize)

      const base = pad + qrSize // 608

      // Nombre empresa
      ctx.fillStyle = '#0f172a'
      ctx.font = '700 26px system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(business.name, W / 2, base + 42)

      // Separador
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(pad * 2, base + 62)
      ctx.lineTo(W - pad * 2, base + 62)
      ctx.stroke()

      // Logo Asistia (ícono + wordmark)
      const iconSize = 32
      ctx.font = '800 28px system-ui, -apple-system, sans-serif'
      const wordW  = ctx.measureText(t('Asistia')).width
      const logoX  = W / 2 - (iconSize + 10 + wordW) / 2
      const logoY  = base + 104
      ctx.drawImage(logoImg, logoX, logoY - iconSize + 4, iconSize, iconSize)
      ctx.fillStyle  = '#2E7DE9'
      ctx.textAlign  = 'left'
      ctx.fillText(t('Asistia'), logoX + iconSize + 10, logoY)

      const link = document.createElement('a')
      link.download = `qr-asistencia-${business.name.replace(/\s+/g, '-').toLowerCase()}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    })
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold text-slate-900 mb-1">{t('Código QR')}</h1>
      <p className="text-sm text-slate-500 mb-6">
        {t('Comparte o imprime este código para que tus empleados registren su asistencia.')}
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-8 flex flex-col items-center gap-6">
        {/* QR */}
        <div ref={qrRef} className="p-4 bg-white rounded-xl border-2 border-slate-100">
          <QRCodeSVG
            value={checkinUrl}
            size={220}
            bgColor="#ffffff"
            fgColor="#0f172a"
            level="H"
          />
        </div>

        {/* Nombre empresa */}
        <div className="text-center">
          <p className="font-semibold text-slate-800 text-base">{business.name}</p>
          <p className="text-xs text-slate-400 mt-1 break-all">{checkinUrl}</p>
        </div>

        {/* Botón descargar */}
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {t('Descargar QR')}
        </button>
      </div>

      {/* Explicación */}
      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-blue-900">{t('¿Cómo funciona?')}</h2>
        <ol className="space-y-2 text-sm text-blue-800">
          <li className="flex gap-2">
            <span className="font-bold shrink-0">1.</span>
            {t('Imprime o muestra este QR en un lugar visible de tu local.')}
          </li>
          <li className="flex gap-2">
            <span className="font-bold shrink-0">2.</span>
            {t('El empleado escanea el QR con la cámara de su celular, no necesita instalar ninguna app.')}
          </li>
          <li className="flex gap-2">
            <span className="font-bold shrink-0">3.</span>
            {t('Busca su nombre, ingresa su PIN si aplica, y presiona')}{' '}<strong>{t('Marcar asistencia')}</strong>.
          </li>
          <li className="flex gap-2">
            <span className="font-bold shrink-0">4.</span>
            {t('El registro aparece en tu dashboard en tiempo real.')}
          </li>
        </ol>
      </div>
    </div>
  )
}
