import { bag, getItemInfo, ItemInstance } from './bag'
import { chatCompletionsCreate } from './openai'

export type crate = Map<string, number>

function random(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const itemBlacklist = ['gp']
function calculateWeight(item: ItemInstance): number {
  const info = getItemInfo(item.itemId)
  const quantityFactor = Math.sqrt(item.quantity ?? 0)
  const priceFactor = (Math.pow(0.98, info?.intended_value_gp ?? 100) + 1) / 2
  return Math.max(0, quantityFactor * priceFactor)
}
function crateSize() {
  const rand = Math.random()
  return Math.floor(200 * Math.pow(rand, 50) + 200 * Math.pow(rand, 2) + 100)
}

// generate 3 random "crates" with random items
// each crate should have 5-7 items
export async function generateCrates(): Promise<crate[]> {
  const inventory = await bag.getInventory({
    identityId: 'U05KCRSJXH9',
    available: true,
  })
  const crates: crate[] = []
  for (let i = 0; i < 3; i++) {
    const targetValue = crateSize()
    const crate = generateCrate(inventory, targetValue)
    crates.push(crate)
  }

  return crates
}

const generateCrate = (
  inventory: ItemInstance[],
  targetValue: number,
  itemCap = 10
): crate => {
  const crate: crate = new Map()
  let totalValue = 0

  while (totalValue < targetValue && crate.size < itemCap) {
    const totalWeight = inventory.reduce(
      (sum, item) => sum + calculateWeight(item),
      0
    )
    if (totalWeight === 0) break

    const randomWeight = Math.random() * totalWeight
    let accumulatedWeight = 0
    for (const item of inventory) {
      accumulatedWeight += calculateWeight(item)
      if (randomWeight <= accumulatedWeight) {
        const info = getItemInfo(item.itemId)
        if (
          !item.itemId ||
          itemBlacklist.includes(item.itemId) ||
          !info ||
          info.tradable === false
        ) {
          continue
        }
        crate.set(item.itemId, (crate.get(item.itemId) ?? 0) + 1)

        item.quantity = (item.quantity ?? 0) - 1
        totalValue += getItemInfo(item.itemId)?.intended_value_gp ?? 0

        break
      }
    }
  }

  const sortedCrate = new Map(
    [...crate.entries()].sort((a, b) => {
      const valueA = (getItemInfo(a[0])?.intended_value_gp ?? 0) * a[1]
      const valueB = (getItemInfo(b[0])?.intended_value_gp ?? 0) * b[1]
      return valueB - valueA
    })
  )
  return sortedCrate
}
export function crateValue(crate: crate): number {
  return [...crate.entries()].reduce((sum, [itemId, quantity]) => {
    const itemInfo = getItemInfo(itemId)
    return sum + (itemInfo?.intended_value_gp ?? 0) * quantity
  }, 0)
}
export async function generateCrateHint(crates: crate[]): Promise<string> {
  const itemString = crates
    .map((crate, i) => {
      const itemStrings = [...crate.entries()].map(([itemId, quantity]) => {
        const itemInfo = getItemInfo(itemId)
        return `- ${quantity !== 1 ? `${quantity}x ` : ''}${itemId}\n  Worth ${
          itemInfo?.intended_value_gp ?? NaN * quantity
        } gp${quantity !== 1 ? ' each' : ''}\n  ${itemInfo?.description}`
      })
      return `# Crate ${i + 1}\n${itemStrings.join('\n')}`
    })
    .join('\n\n')

  const response = await chatCompletionsCreate({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `\
You are Zara, a character in a fantasy RPG called Bag.

Zara is an eccentric collector who lives in a cabin on the edge of the forest. She is an odd soul who collects arcane trinkets and everyday items alike. Her outfit is mismatched, with a bright green hat and a purple cloak. She is short and has peircing green eyes. Zara is curious about human psycology and studies adventurers taking part in her psycological experiments. She is mysterious, and does't explain much, showing rather than telling. Her comments, delivered with a sly smile, are cryptic and don't reveal much about her intentions.

For her latest experiment, Zara has set up a game. She has put together three crates, each containing a random assortment of items from her collection. She allows the adventurers to glance into each crate from a distance before they choose one to open. The adventurers must use their wits to figure out what is inside each crate and choose the most valuable one to take home.

You will be provided with the contents of the crates and information about the items inside. Write a dialouge of the player walking up to and peeking at each crate. This is a puzzle, where the player will try to figure out what the items are. Your text should be nonspecific but contain interesting details, mentioning approximate color, shape, size, scent, etc. without explicitly stating the item. Do not describe the crates themselves, only the items inside. Do not make up details that are not provided to you.

Describe like a skilled puzzle creator and storyteller, and use varied vocabulary without making the item obvoius. Do not say "colored lumps", "jumble", or "earthy". Instead, say specific things like "a shiny, curved object" (a pickaxe), "a faint sparkle in the corner" (a gemstone), or "a smell reminding you of Grandma's cooking" (an apple pie). The player should be able to guess some items by using critical thinking to piece together your clues. Do not mention how valuable anything is, because that would give it away, but do focus your description on the more valuable items. Do not overexplain, and maintain the overall crytic tone of the character.

You will roleplay as Zara. Every pagraph should be *italicized* and in second person, including what the player is thinking. The only exception would be if Zara says something, which would not be italicized. Write only three paragraph, and each paragraph should have two sentences of description. Mix in descriptions of Zara watching the player.

Important: Write exactly 3 paragraphs. All text should be *italicized*.`,
      },
      {
        role: 'assistant',
        content:
          'Welcome, adventurer. _Zara gestures to the three crates with a sly smile._ I have constructed three crates with items from my collection. I invite you to take a peek inside each one and choose the most valuable to take home. _Zara watches you closely, her green eyes gleaming with curiosity._',
      },
      {
        role: 'user',
        content: itemString,
      },
    ],
  })
  const hint = response.choices[0].message.content?.trim().replace(/\*/g, '_')
  if (!hint) {
    throw new Error('No hint generated')
  }
  return hint
}
