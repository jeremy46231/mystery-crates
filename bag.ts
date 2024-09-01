import { App as Bag, type Instance as ItemInstance } from '@hackclub/bag'
export type { Instance as ItemInstance } from '@hackclub/bag'

import YAML from 'yaml'
import env from './env.ts'

export const bag = await Bag.connect({
  ...env.bag,
})

export type ItemInfo = {
  name: string
  artist: string
  description: string
  tag: string
  tradable?: boolean
  intended_value_atus: number
  intended_value_gp: number
  genstore_sell_to_player_price: number
  genstore_buy_from_player_price: number
  genstore_price_variance: number
  frequency?: number | null
}

const yamlString = await (
  await fetch(
    'https://github.com/hackclub/bag-manifest/raw/production/items.yaml'
  )
).text()
export const items = YAML.parse(yamlString) as ItemInfo[]
console.log(`Loaded ${items.length} items`)

export function getItemInfo(name?: string) {
  if (!name) return null
  return items.find((item) => item.name === name) ?? null
}

export async function getInventory(userId: string, available = true) {
  const raw = await bag.getInventory({
    identityId: userId,
    available,
  })
  return new Map(
    raw
      .filter((item) => item.itemId !== 'gp')
      .map((item) => [item.itemId, item.quantity])
  )
}
