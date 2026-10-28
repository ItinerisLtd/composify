import { expect } from 'chai'

import { mergeComposerJson } from '../src/composer-json.js'

describe('mergeComposerJson', () => {
  it('merges nested objects and lets overrides win', () => {
    const base = { extra: { composify: { version: '1.0.0' }, 'installer-name': 'example-plugin' }, name: 'example/a' }
    const overrides = { extra: { 'installer-name': 'other-folder', foo: 'bar' } }

    expect(mergeComposerJson(base, overrides)).to.deep.equal({
      extra: { composify: { version: '1.0.0' }, foo: 'bar', 'installer-name': 'other-folder' },
      name: 'example/a',
    })
  })

  it('replaces arrays instead of merging them', () => {
    expect(mergeComposerJson({ keywords: ['a', 'b'] }, { keywords: ['c'] })).to.deep.equal({ keywords: ['c'] })
  })

  it('removes keys set to null', () => {
    const base = { extra: { 'installer-name': 'example-plugin', foo: 'bar' } }

    expect(mergeComposerJson(base, { extra: { 'installer-name': null } })).to.deep.equal({ extra: { foo: 'bar' } })
  })

  it('drops null values inside a newly added object', () => {
    expect(mergeComposerJson({}, { extra: { foo: 'bar', gone: null } })).to.deep.equal({ extra: { foo: 'bar' } })
  })

  it('keeps a __proto__ key as a plain key', () => {
    const merged = mergeComposerJson({ name: 'example/a' }, JSON.parse('{"__proto__":{"x":1}}'))

    expect(JSON.stringify(merged)).to.equal('{"name":"example/a","__proto__":{"x":1}}')
    expect(Object.getPrototypeOf(merged)).to.equal(Object.prototype)
  })

  it('does not modify the base object', () => {
    const base = { extra: { foo: 'bar' } }
    mergeComposerJson(base, { extra: { foo: 'baz' } })

    expect(base).to.deep.equal({ extra: { foo: 'bar' } })
  })
})
