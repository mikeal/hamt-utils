import * as hamt from '../index.js'
import Block from '@ipld/block/defaults'
import { deepStrictEqual as same } from 'assert'

const store = () => {
  const blocks = {}
  const get = async cid => {
    return blocks[cid.toString()]
  }
  const put = async block => {
    const cid = await block.cid()
    blocks[cid.toString()] = block
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
    for await (const block of hamt.from(Block, map)) {
      head = block
      await put(block)
    }
    await compare(map, await head.cid(), get)
  })
}
