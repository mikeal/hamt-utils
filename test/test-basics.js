import create from '../index.js'
import * as codec from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { deepStrictEqual as same } from 'assert'

const hamt = create({ codec, hasher })

const store = () => {
  const blocks = {}
  const get = async cid => {
    return blocks[cid.toString()]
  }
  const put = async block => {
    blocks[block.cid.toString()] = block
  }
  return { get, put }
}

const compare = async (map, head, get) => {
  const c = {}
  for await (let { key, value } of hamt.all(await head, get)) {
    key = (new TextDecoder()).decode(key)
    c[key] = value
  }
  same(map, c)
}

export default test => {
  test('from', async () => {
    const { get, put } = store()
    const map = { hello: 'world', world: 'hello' }
    let head
    for await (const block of hamt.from(map)) {
      head = block
      await put(block)
    }
    await compare(map, head.cid, get)
  })
}
