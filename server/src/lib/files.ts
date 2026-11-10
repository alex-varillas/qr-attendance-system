import fs from 'node:fs'
import path from 'node:path'
import type { Config } from '../config.ts'
import { badRequest } from './errors.ts'

export type ImageKind = { ext: 'jpg' | 'png' | 'webp'; mime: string }

/** Identifies an image by its first bytes. The file name and the declared type sent by the client are never trusted. */
export function detectImage(buffer: Buffer): ImageKind | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' }
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', mime: 'image/png' }
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' }
  }
  return null
}

const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export function photosDir(config: Config): string {
  return path.join(config.dataDir, 'photos')
}

/** Saves the employee's photo, replacing any previous one. */
export function savePhoto(config: Config, employeeId: string, buffer: Buffer): void {
  const image = detectImage(buffer)
  if (!image) throw badRequest('The photo must be a JPEG, PNG or WebP image', 'invalid_image')
  deletePhoto(config, employeeId)
  fs.mkdirSync(photosDir(config), { recursive: true })
  fs.writeFileSync(path.join(photosDir(config), `${employeeId}.${image.ext}`), buffer)
}

export function deletePhoto(config: Config, employeeId: string): void {
  const dir = photosDir(config)
  if (!fs.existsSync(dir)) return
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith(`${employeeId}.`)) fs.rmSync(path.join(dir, file), { force: true })
  }
}

/** Path and content type of the employee's photo, or null. `employeeId` must be a validated UUID. */
export function findPhoto(config: Config, employeeId: string): { file: string; mime: string } | null {
  const dir = photosDir(config)
  if (!fs.existsSync(dir)) return null
  const file = fs.readdirSync(dir).find((name) => name.startsWith(`${employeeId}.`))
  if (!file) return null
  const ext = file.split('.').pop() ?? ''
  return { file: path.join(dir, file), mime: MIME_BY_EXT[ext] ?? 'application/octet-stream' }
}

export function reportsDir(config: Config): string {
  return path.join(config.dataDir, 'reports')
}
