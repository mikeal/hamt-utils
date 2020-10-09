import iamap from 'iamap'
import assert from 'assert'
import { encode } from 'multiformats/block'
import murmurhash3 from 'murmurhash3js-revisited'

const isCID = node => node.asCID === node

function murmurHasher (key) {
  // TODO: get rid of Buffer
  assert(Buffer.isBuffer(key))
  const b = Buffer.alloc(4)
  b.writeUInt32LE(murmurhash3.x86.hash32(key))
  return b
}
iamap.registerHasher('murmur3-32', 32, murmurHasher)

const noop = () => {}
const config = { hashAlg: 'murmur3-32' }
const isEqual = (one, two) => one.equals(two)
const isLink = isCID
const mkload = get => cid => get(cid).then(({ value }) => value)
const store = { isEqual, isLink }

export default ({ codec, hasher }) => {
  const transaction = async function * (head, ops, get) {
    const blocks = []
    const save = async value => {
      const block = await encode({ value, codec, hasher })
      blocks.push(block)
      return block.cid
    }

    const load = mkload(get)
    let map = await iamap.load({ save, load, ...store }, head)
    for (const op of ops) {
      if (op.set) {
        map = await map.set(op.set.key, op.set.val)
      } else if (op.del) {
        map = await map.delete(op.del.key)
      } /* c8 ignore next */ else {
        /* c8 ignore next */
        throw new Error('Invalid operation')
        /* c8 ignore next */
      }
    }
    // would be great to have a hamt API that took bulk operations
    // and was async iterable
    yield * blocks
  }

  const fixture = { save: noop, load: noop, ...store }
  const empty = () => {
    const map = new iamap.IAMap(fixture, config)
    return encode({ value: map.toSerializable(), codec, hasher })
  }

  const _load = async (head, get) => {
    const load = mkload(get)
    const map = await iamap.load({ save: noop, load, ...store }, head)
    return map
  }

  const get = async (head, key, get) => {
    const map = await _load(head, get)
    return map.get(key)
  }
  const has = async (head, key, _get) => {
    const val = await get(head, key, _get)
    if (typeof val === 'undefined') return false
    return true
  }
  const all = (root, get) => {
    const iter = async function * () {
      const map = await _load(root, get)
      const entries = await map.entries()
      yield * entries
    }
    return iter()
  }
  const bulk = transaction
  const _store = store
  const _noop = noop

  const from = async function * (map) {
    const headBlock = await empty()
    const head = headBlock.cid
    const blocks = {}
    blocks[head.toString()] = headBlock
    const get = async cid => {
      return blocks[cid.toString()] || null
    }
    const opts = Object.entries(map).map(([key, val]) => ({ set: { key, val } }))
    let last
    for await (const block of bulk(head, opts, get)) {
      blocks[block.cid.toString()] = block
      last = block
    }
    const seen = new Set()
    const traverse = async function * (block) {
      const { cid } = block
      if (seen.has(cid.toString())) return
      seen.add(cid.toString())
      for (const [, link] of block.links()) {
        const b = await get(link)
        if (!b) continue
        yield * traverse(b)
      }
      yield block
    }
    yield * traverse(last)
  }

  return { all, bulk, empty, get, _store, _noop, has, from }
}
