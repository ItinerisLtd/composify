import { expect } from 'chai'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import * as tmp from 'tmp'

import { backupOriginalComposerJson, canBackUpOriginalComposerJson } from '../src/composer-json.js'

tmp.setGracefulCleanup()

describe('backupOriginalComposerJson', () => {
  it('moves the plugin composer.json to composer.original.json', () => {
    const { name: directory } = tmp.dirSync({ unsafeCleanup: true })
    writeFileSync(`${directory}/composer.json`, '{"autoload":{"files":["helpers.php"]}}')

    expect(canBackUpOriginalComposerJson(directory)).to.equal(true)
    backupOriginalComposerJson(directory)

    expect(existsSync(`${directory}/composer.json`)).to.equal(false)
    expect(readFileSync(`${directory}/composer.original.json`, 'utf8')).to.equal('{"autoload":{"files":["helpers.php"]}}')
  })

  it('does nothing when the plugin has no composer.json', () => {
    const { name: directory } = tmp.dirSync({ unsafeCleanup: true })

    expect(canBackUpOriginalComposerJson(directory)).to.equal(false)
    backupOriginalComposerJson(directory)

    expect(existsSync(`${directory}/composer.original.json`)).to.equal(false)
  })

  it('leaves a composer.original.json the plugin ships untouched', () => {
    const { name: directory } = tmp.dirSync({ unsafeCleanup: true })
    writeFileSync(`${directory}/composer.json`, '{"name":"vendor/new"}')
    writeFileSync(`${directory}/composer.original.json`, '{"name":"vendor/shipped"}')

    expect(canBackUpOriginalComposerJson(directory)).to.equal(false)
    backupOriginalComposerJson(directory)

    expect(readFileSync(`${directory}/composer.original.json`, 'utf8')).to.equal('{"name":"vendor/shipped"}')
  })
})
