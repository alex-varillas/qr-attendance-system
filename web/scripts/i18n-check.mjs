// Checks the English translations against the code.
//
//   npm run i18n:check           fails when a text in the code has no English translation
//   npm run i18n:check -- --list  prints every translatable text found in the code
//
// A translatable text is the first argument (a string) of a call to t(...), or the two texts of tn(...). The comparison is done on the
// source of the interface, so a text added to a screen without its translation is caught before release.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(webDir, 'src')
const require = createRequire(path.join(webDir, 'package.json'))
const { parse } = require('@babel/parser')

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'i18n' ? [] : listFiles(full)
    return /\.(jsx|js)$/.test(entry.name) && !/\.test\.js$/.test(entry.name) ? [full] : []
  })
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return
  visit(node)
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'extra') continue
    const value = node[key]
    if (Array.isArray(value)) value.forEach((child) => child && walk(child, visit))
    else if (value && typeof value.type === 'string') walk(value, visit)
  }
}

/** Every text passed to t(...) in the source, with the files that use it. */
export function collectKeys() {
  const keys = new Map()
  const dynamic = []
  for (const file of listFiles(srcDir)) {
    const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] })
    walk(ast, (node) => {
      if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return
      // t('text') has one text; tn(count, 'one', 'other') has two.
      const texts = node.callee.name === 't' ? [node.arguments[0]] : node.callee.name === 'tn' ? [node.arguments[1], node.arguments[2]] : null
      if (!texts) return
      const relative = path.relative(webDir, file)
      for (const text of texts) {
        if (text?.type === 'StringLiteral') {
          if (!keys.has(text.value)) keys.set(text.value, new Set())
          keys.get(text.value).add(relative)
        } else {
          dynamic.push(`${relative}:${node.loc.start.line}`)
        }
      }
    })
  }
  return { keys, dynamic }
}

/** Every message the server can send to the screen, read from its source (skipped when the server folder is absent). */
export function collectServerMessages() {
  const serverDir = path.resolve(webDir, '..', 'server', 'src')
  if (!fs.existsSync(serverDir)) return []
  const found = new Set()
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { visit(full); continue }
      if (!entry.name.endsWith('.ts')) continue
      const source = fs.readFileSync(full, 'utf8')
      const patterns = [
        /(?:badRequest|forbidden|conflict|notFound|badGateway|unauthorized)\(\s*([`'"])((?:\\.|(?!\1)[^])*)\1/g,
        /new HttpError\(\d+,\s*([`'"])((?:\\.|(?!\1)[^])*)\1/g,
        /(?:message|error)\s*[:=]\s*([`'"])((?:\\.|(?!\1)[^])*)\1/g,
      ]
      for (const pattern of patterns) for (const match of source.matchAll(pattern)) found.add(match[2])
    }
  }
  visit(serverDir)
  // The generic names of the code itself ('network error') are not shown to people.
  return [...found].filter((message) => /^[A-Z]/.test(message))
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  const { keys, dynamic } = collectKeys()
  const english = (await import(pathToFileURL(path.join(srcDir, 'i18n', 'en.js')).href)).default

  if (process.argv.includes('--list')) {
    for (const key of [...keys.keys()].sort()) console.log(key)
    process.exit(0)
  }

  const { SPANISH, PATTERNS } = await import(pathToFileURL(path.join(srcDir, 'i18n', 'serverMessages.js')).href)
  // A message written with a template (${...}) is covered when one of the patterns matches it with a sample value.
  const uncoveredServer = collectServerMessages().filter((message) => {
    if (SPANISH[message]) return false
    const sample = message.replace(/\$\{[^}]*\}/g, '5')
    return !PATTERNS.some(([pattern]) => pattern.test(sample))
  })
  if (uncoveredServer.length) {
    console.log(`\n${uncoveredServer.length} server message(s) without a Spanish translation (web/src/i18n/serverMessages.js):`)
    for (const message of uncoveredServer) console.log(`  ${message}`)
    process.exitCode = 1
  }

  const missing = [...keys.keys()].filter((key) => english[key] === undefined)
  const unused = Object.keys(english).filter((key) => !keys.has(key))
  console.log(`${keys.size} texts in the code, ${Object.keys(english).length} translations`)
  if (dynamic.length) {
    console.log(`\n${dynamic.length} call(s) of t() with a text that is not a plain string (they cannot be checked):`)
    for (const place of dynamic) console.log(`  ${place}`)
  }
  if (unused.length) {
    console.log(`\n${unused.length} translation(s) no longer used by the code:`)
    for (const key of unused) console.log(`  ${key}`)
  }
  if (missing.length) {
    console.log(`\n${missing.length} text(s) without an English translation:`)
    for (const key of missing) console.log(`  ${key}`)
    process.exit(1)
  }
  console.log('\nEvery text has an English translation.')
}
