import { App as Bag, type Instance as ItemInstance } from '@hackclub/bag'
export type { Instance as ItemInstance } from '@hackclub/bag'

import YAML from 'yaml'
import { nanoid } from 'nanoid'
import type Slack from '@slack/bolt'
import env from './env.ts'

export const bag = await Bag.connect({
  ...env.bag,
})
await bag.getApp({ optAppId: env.bag.appId })
const bagAccountID = env.bagAccountID

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

export async function getInventory(available = true) {
  const raw = await bag.getInventory({
    identityId: bagAccountID,
    available,
  })
  return new Map(
    raw
      .filter((item) => item.itemId !== 'gp')
      .map((item) => [item.itemId, item.quantity])
  )
}

let botID: null | string = null
type reasonString =
  | 'source_insufficient_items'
  | 'target_insufficient_items'
  | 'user_declined'
type offerResult = {
  accepted: boolean
  reason?: reasonString
}
type offerClosure = {
  date: Date
  resolve: {
    (result: offerResult): void
  }
}
const offerClosures = new Map<string, offerClosure>()

export async function chargeUser(userID: string, gp: number) {
  if (!botID) {
    throw new Error('Bot ID not set')
  }

  const userGp = (await bag.getInventory({ identityId: userID }))
    .filter((instance) => instance.itemId === 'gp')
    .reduce((acc, instance) => acc + (instance.quantity ?? 0), 0)
  if (userGp < gp) {
    return {
      accepted: false,
      reason: 'target_insufficient_items',
    } as offerResult
  }

  const offerID = nanoid()
  const promise = new Promise<offerResult>((resolve) => {
    offerClosures.set(offerID, {
      date: new Date(),
      resolve,
    })
  })

  await bag.makeOffer({
    sourceIdentityId: bagAccountID,
    targetIdentityId: userID,
    offerToGive: [],
    offerToReceive: [{ itemName: 'gp', quantity: gp }],
    slackIdToDm: botID,
    callbackUrl: offerID,
  })

  return await promise
}

export async function addSlackBagMessageListener(app: Slack.App) {
  app.event('message', async ({ event, client }) => {
    if (event.type !== 'message') return
    if (event.channel_type !== 'im') return
    if ('user' in event && event.user !== 'U067VQW1D9P') return
    if (!('text' in event) || !event.text) throw new Error('No text in message')
    const json = JSON.parse(event.text) as {
      sourceIdentityId: string
      targetIdentityId: string
      itemNamesToGive: string[]
      itemQuantitiesToGive: number[]
      itemNamesToReceive: string[]
      itemQuantitiesToReceive: number[]
      callbackUrl: string
      accepted: boolean
      reason?: reasonString
    }

    const offerID = json.callbackUrl

    const closure = offerClosures.get(offerID)
    if (!closure) throw new Error(`No closure for offer ${offerID}`)
    closure.resolve({
      accepted: json.accepted,
      reason: json.reason,
    })

    offerClosures.delete(offerID)
  })

  botID = (await app.client.auth.test()).user_id ?? null
}

export async function giveItems(
  userID: string,
  items: { itemID: string; quantity: number }[]
) {
  const inventory = await bag.getInventory({ identityId: bagAccountID })

  const instances: { id: number; quantity: number }[] = []

  for (const item of items) {
    const instance = inventory.find(
      (instance) => instance.itemId === item.itemID
    )
    if (!instance || !instance.id) {
      console.error(
        `Item ${item.itemID} not found in inventory to give to ${userID}`
      )
      return false
    }

    if ((instance.quantity ?? 0) < item.quantity) {
      console.error(
        `Not enough items of ${item.itemID} to give to ${userID}: ${instance.quantity} < ${item.quantity}`
      )
      return false
    }

    instances.push({ id: instance.id, quantity: item.quantity })
  }
  await bag.runGive({
    giverId: bagAccountID,
    receiverId: userID,
    instances,
  })
  return true
}
