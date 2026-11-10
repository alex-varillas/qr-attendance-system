// A small translation layer. The text written in the code (Spanish, the original language of the
// product) is the key; the English dictionary maps it to English. With the language set to Spanish,
// `t` returns the text as written, so a missing translation never breaks a screen: it just stays in Spanish.
//
//   t('Guardar')                              -> 'Guardar' | 'Save'
//   t('Hola, {0}', [name])                    -> 'Hola, Ana' | 'Hello, Ana'
//   tn(2, '{0} día', '{0} días')              -> '2 días' | '2 days'
//
// `npm run i18n:check` fails when a text in the code has no English translation.

import { useSyncExternalStore } from 'react'
import en from './en.js'

const DICTIONARIES = { en }

let locale = 'es'
const listeners = new Set()

export const SUPPORTED_LOCALES = ['es', 'en']

/** Sets the language of the interface (and of the dates, which read it from here). */
export function setLocale(value) {
  if (!SUPPORTED_LOCALES.includes(value) || value === locale) return
  locale = value
  if (typeof document !== 'undefined') document.documentElement.lang = value
  listeners.forEach((listener) => listener())
}

export function getLocale() {
  return locale
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Re-renders the component when the language changes. Texts are read when a component renders, so only the
 * screens that can be open while the language changes need it: the layout, the first-run setup and the settings.
 */
export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale)
}

function fill(text, params) {
  if (!params || params.length === 0) return text
  return text.replace(/\{(\d+)\}/g, (match, index) => (params[Number(index)] ?? match))
}

/** Translates a text written in Spanish to the language of the interface. */
export function t(text, params) {
  const dictionary = DICTIONARIES[locale]
  const translated = dictionary?.[text] ?? text
  return fill(translated, params)
}

/**
 * Translates a text that depends on a quantity: both forms are full phrases, so each language can word them
 * as it needs. `{0}` is the quantity unless other params are given.
 *
 *   tn(3, '{0} tardanza', '{0} tardanzas')   -> '3 tardanzas' | '3 late arrivals'
 */
export function tn(count, one, other, params) {
  return t(count === 1 ? one : other, params ?? [count])
}
