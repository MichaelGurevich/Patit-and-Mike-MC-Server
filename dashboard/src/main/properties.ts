import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RepoPaths } from './paths'

function propsFile(paths: RepoPaths): string {
  return join(paths.serverDir, 'server.properties')
}

/** Read server.properties into a flat key→value map (raw values, comments skipped). */
export function readProperties(paths: RepoPaths): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const text = readFileSync(propsFile(paths), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue
      const i = line.indexOf('=')
      if (i === -1) continue
      out[line.slice(0, i).trim()] = line.slice(i + 1)
    }
  } catch {
    /* no file yet */
  }
  return out
}

/**
 * Set one key, preserving every other line, the comment header, and the file's
 * existing line endings. Appends the key if it isn't already present.
 */
export function setProperty(paths: RepoPaths, key: string, value: string): void {
  const file = propsFile(paths)
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    /* will be created */
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.length ? text.split(/\r?\n/) : []
  let found = false
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.startsWith('#')) continue
    const eq = l.indexOf('=')
    if (eq !== -1 && l.slice(0, eq).trim() === key) {
      lines[i] = `${key}=${value}`
      found = true
      break
    }
  }
  if (!found) lines.push(`${key}=${value}`)
  writeFileSync(file, lines.join(eol))
}
