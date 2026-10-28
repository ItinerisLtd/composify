import { expect } from 'chai'

import { buildComposerJson, type ComposerJsonOptions } from '../src/composer-json.js'

const options: ComposerJsonOptions = {
  buildAt: '2026-01-01T00:00:00.000Z',
  description: 'An example plugin',
  directory: 'example-plugin',
  file: 'example-plugin.php',
  license: 'GPL-2.0-or-later',
  name: 'example-plugin',
  type: 'wordpress-plugin',
  vendor: 'example',
  version: '1.2.3',
  zip: 'https://example.com/example-plugin.zip',
}

describe('buildComposerJson', () => {
  it('builds the package metadata', () => {
    expect(buildComposerJson(options)).to.deep.equal({
      name: 'example/example-plugin',
      description: 'An example plugin',
      type: 'wordpress-plugin',
      license: 'GPL-2.0-or-later',
      require: {
        'composer/installers': '^1.6 || ^2.3',
      },
      extra: {
        composify: {
          zip: 'https://example.com/example-plugin.zip',
          file: 'example-plugin.php',
          version: '1.2.3',
          'build-at': '2026-01-01T00:00:00.000Z',
        },
      },
    })
  })

  it('omits installer-name when the directory matches the package name', () => {
    expect(buildComposerJson(options).extra).to.not.have.property('installer-name')
  })

  it('sets installer-name to the directory when it differs from the package name', () => {
    const composer = buildComposerJson({ ...options, name: 'example-plugin-pro' })

    expect(composer.name).to.equal('example/example-plugin-pro')
    expect(composer.extra['installer-name']).to.equal('example-plugin')
  })
})
