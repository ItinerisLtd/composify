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
