import fse from 'fs-extra'

export type JsonObject = Record<string, unknown>

export const ORIGINAL_COMPOSER_JSON = 'composer.original.json'

export interface ComposerJsonOptions {
  buildAt: string
  description: string
  directory: string
  file: string
  license: string
  name: string
  type: string
  vendor: string
  version: string
  zip: string
}

export interface ComposerJson {
  description: string
  extra: {
    composify: {
      'build-at': string
      file: string
      version: string
      zip: string
    }
    'installer-name'?: string
  }
  license: string
  name: string
  require: Record<string, string>
  type: string
}

/**
 * composer/installers names the install folder after the package, so `installer-name` is set whenever the
 * plugin's own folder differs from the package name.
 * Otherwise WordPress cannot find the plugin at the path it was activated under.
 */
export function buildComposerJson(options: ComposerJsonOptions): ComposerJson {
  const { buildAt, description, directory, file, license, name, type, vendor, version, zip } = options

  const composer: ComposerJson = {
    name: `${vendor}/${name}`,
    description,
    type,
    license,
    require: {
      'composer/installers': '^1.6 || ^2.3',
    },
    extra: {
      composify: {
        zip,
        file,
        version,
        'build-at': buildAt,
      },
    },
  }

  if (directory !== name) {
    composer.extra['installer-name'] = directory
  }

  return composer
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseInline(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch (error) {
    throw new Error(`--composer-json: invalid JSON in the inline value: ${errorMessage(error)}`)
  }
}

function readJsonFile(path: string): unknown {
  try {
    return fse.readJsonSync(path)
  } catch (error) {
    throw new Error(`--composer-json: cannot read ${path}: ${errorMessage(error)}`)
  }
}

/**
 * Parse `--composer-json`, which is either a JSON object or a path to a file containing one.
 * A value starting with `{` or `[` is treated as JSON, anything else as a file path.
 */
export function parseComposerJsonOverrides(value?: string): JsonObject {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') {
    return {}
  }

  const isInline = trimmed.startsWith('{') || trimmed.startsWith('[')
  const parsed = isInline ? parseInline(trimmed) : readJsonFile(trimmed)

  if (!isJsonObject(parsed)) {
    const source = isInline ? 'the inline value' : trimmed
    throw new Error(`--composer-json: ${source} must contain a JSON object`)
  }

  return parsed
}

/**
 * Apply `overrides` to `base` as a JSON Merge Patch (RFC 7386).
 * Objects merge recursively, arrays and other values replace, and `null` removes a key.
 */
export function mergeComposerJson(base: object, overrides: JsonObject): JsonObject {
  const merged: JsonObject = { ...base }

  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key]
    const next = isJsonObject(value) ? mergeComposerJson(isJsonObject(current) ? current : {}, value) : value
    Object.defineProperty(merged, key, { configurable: true, enumerable: true, value: next, writable: true })
  }

  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== null))
}

/**
 * Keep the plugin's own composer.json, which the generated one replaces, as composer.original.json.
 * A composer.original.json the plugin already ships is left untouched, so nothing in the zip is lost.
 * Returns whether the backup was made.
 */
export function backupOriginalComposerJson(directory: string): boolean {
  const original = `${directory}/composer.json`
  const backup = `${directory}/${ORIGINAL_COMPOSER_JSON}`
  if (!fse.pathExistsSync(original) || fse.pathExistsSync(backup)) {
    return false
  }

  fse.moveSync(original, backup)
  return true
}
