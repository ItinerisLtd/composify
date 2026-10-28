import { expect } from 'chai'
import { writeFileSync } from 'node:fs'
import * as tmp from 'tmp'

import { parseComposerJsonOverrides } from '../src/composer-json.js'

describe('parseComposerJsonOverrides', () => {
  it('returns an empty object when no value is given', () => {
    expect(parseComposerJsonOverrides()).to.deep.equal({})
    expect(parseComposerJsonOverrides('  ')).to.deep.equal({})
  })

  it('parses inline JSON', () => {
    expect(parseComposerJsonOverrides(' {"extra":{"foo":"bar"}}')).to.deep.equal({ extra: { foo: 'bar' } })
  })

  it('reads a JSON file', () => {
    const { name: path } = tmp.fileSync({ postfix: '.json' })
    writeFileSync(path, '{"require":{"php":">=8.2"}}')

    expect(parseComposerJsonOverrides(path)).to.deep.equal({ require: { php: '>=8.2' } })
  })

  it('trims whitespace around a file path', () => {
    const { name: path } = tmp.fileSync({ postfix: '.json' })
    writeFileSync(path, '{"require":{"php":">=8.2"}}')

    expect(parseComposerJsonOverrides(` ${path}\n`)).to.deep.equal({ require: { php: '>=8.2' } })
  })

  it('reads a JSON file with a byte-order mark', () => {
    const { name: path } = tmp.fileSync({ postfix: '.json' })
    writeFileSync(path, '\uFEFF{"extra":{"foo":"bar"}}')

    expect(parseComposerJsonOverrides(path)).to.deep.equal({ extra: { foo: 'bar' } })
  })

  it('rejects an inline array', () => {
    expect(() => parseComposerJsonOverrides('[{"extra":{}}]')).to.throw('the inline value must contain a JSON object')
  })

  it('rejects invalid JSON', () => {
    expect(() => parseComposerJsonOverrides('{"extra":')).to.throw('invalid JSON in the inline value')
  })

  it('rejects JSON that is not an object', () => {
    const { name: path } = tmp.fileSync({ postfix: '.json' })
    writeFileSync(path, '["not", "an", "object"]')

    expect(() => parseComposerJsonOverrides(path)).to.throw('must contain a JSON object')
  })

  it('rejects a missing file', () => {
    expect(() => parseComposerJsonOverrides('/does/not/exist.json')).to.throw('cannot read /does/not/exist.json')
  })
})
