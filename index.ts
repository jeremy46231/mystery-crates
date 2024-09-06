import Slack from '@slack/bolt'
import env from './env'
import {
  generateCrateHint,
  generateCrates,
  crateValue,
  type crate,
} from './crates'
import {
  addSlackBagMessageListener,
  bag,
  chargeUser,
  getItemInfo,
  giveItems,
} from './bag'
import { addSlackActionListener, createEventPromise } from './slackActions'

const app = new Slack.App({
  ...env.slack,
  socketMode: true,
})

await addSlackBagMessageListener(app)
await addSlackActionListener(app)

const botID = (await app.client.auth.test()).user_id
if (!botID) throw new Error('Could not get bot ID')

///////////////////////////////
////////// Main code //////////
///////////////////////////////

app.event('app_mention', async ({ event, client }) => {
  if (event.subtype) return // Ignore mentions from other bots

  const userID = event.user
  if (!userID) throw new Error('No user ID in event')
  const messageInfo = {
    username: 'Zara',
    channel: event.channel,
    thread_ts: event.ts,
  }

  const crates = await generateCrates(botID)
  if (!crates) {
    const noItemsMessage =
      "_Zara looks at you apolegetially._ I'm sorry, it seems I don't have any trinkets to offer you today."
    await client.chat.postMessage({
      ...messageInfo,
      text: noItemsMessage.replace(/_/g, ''),
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: noItemsMessage,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Please let <@U06UYA5GMB5> know that <@${botID}> is out of stock.`,
            },
          ],
        },
      ],
    })
    return
  }

  const values = crates.map(crateValue)
  const averageValue = values.reduce((a, b) => a + b, 0) / values.length
  const maxValue = Math.max(...values)

  // const cost = Math.max(Math.round((averageValue + maxValue) / 2), 50)
  const cost = Math.round(
    Math.max(maxValue * 0.9, Math.min(1.1 * averageValue, maxValue), 35)
  )

  console.log(
    'Values:',
    values,
    'Average:',
    averageValue,
    'Max:',
    maxValue,
    'Cost:',
    cost
  )
  console.log('Crates:', ...crates.values())

  const generateHintPromise = generateCrateHint(crates)

  const costMessage = `_Zara eyes the player with a sly smile, her green hat tilting slightly._ Curiosity comes at a price. _Her voice is almost a whisper._ A few coins, and the game is yours.`

  const payMessage = await client.chat.postMessage({
    ...messageInfo,
    text: `${costMessage.replace(/_/g, '')}\nPay ${cost} gp`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: costMessage,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Accept the offer in your DMs to pay ${cost} :-gp:`,
          },
        ],
      },
    ],
  })

  const result = await chargeUser(userID, cost)
  if (!result.accepted) {
    let errorMessage = `> An error occurred when trying to charge you ${cost} :-gp:`
    if (result.reason === 'target_insufficient_items') {
      errorMessage = `> You don't have enough gp to pay ${cost} :-gp:`
    }
    if (result.reason === 'user_declined') {
      errorMessage = `> You declined the offer to pay ${cost} :-gp:`
    }
    client.chat.update({
      ...messageInfo,
      ts: payMessage.ts!,
      text: errorMessage,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: costMessage,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: errorMessage,
          },
        },
      ],
    })
    return
  }

  client.chat.update({
    ...messageInfo,
    ts: payMessage.ts!,
    text: costMessage.replace(/_/g, ''),
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: costMessage,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `> You handed Zara :-gp: ${cost}`,
        },
      },
    ],
  })

  const loadingMessagePromise = await client.chat.postMessage({
    ...messageInfo,
    text: 'Loading...',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':spin-loading:',
        },
      },
    ],
  })

  const [hint, loadingMessage] = await Promise.all([
    generateHintPromise,
    loadingMessagePromise,
  ])

  const hintParts = hint.split(/\n+/)
  const remainingHintParts = [...hintParts]
  const firstHintPart = remainingHintParts.shift()!

  const hintMessages = [loadingMessage]

  await client.chat.update({
    ...messageInfo,
    ts: loadingMessage.ts!,
    text: firstHintPart.replace(/_/g, ''),
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: firstHintPart,
        },
      },
    ],
  })

  for (const part of remainingHintParts) {
    const hintMessage = await client.chat.postMessage({
      ...messageInfo,
      text: part.replace(/_/g, ''),
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: part,
          },
        },
      ],
    })
    hintMessages.push(hintMessage)
  }

  const selectQuestion =
    '_Zara looks at you, expression unreadable._ So, explorer, which crate will you choose?'

  const [selectID, selectPromise] = createEventPromise<
    Slack.BlockAction<Slack.StaticSelectAction>
  >(userID, 'static_select')

  const selectCrateMessage = await client.chat.postMessage({
    ...messageInfo,
    text: selectQuestion.replace(/_/g, ''),
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: selectQuestion,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'static_select',
            placeholder: {
              type: 'plain_text',
              text: 'Select a crate',
              emoji: true,
            },
            options: [
              {
                text: {
                  type: 'plain_text',
                  text: 'Crate 1',
                  emoji: true,
                },
                value: '0',
              },
              {
                text: {
                  type: 'plain_text',
                  text: 'Crate 2',
                  emoji: true,
                },
                value: '1',
              },
              {
                text: {
                  type: 'plain_text',
                  text: 'Crate 3',
                  emoji: true,
                },
                value: '2',
              },
            ],
            action_id: selectID,
          },
        ],
      },
    ],
  })

  const selectResponse = await selectPromise
  selectResponse.ack()

  const selectedCrateIndex = Number(selectResponse.action.selected_option.value)
  const selectedCrate = crates[selectedCrateIndex]
  const selectedCrateValue = crateValue(selectedCrate)

  const makeCrateContentsBlocks = (crate: crate) => [
    ...[...crate.entries()].map(([itemID, quantity]) => {
      const itemInfo = getItemInfo(itemID)
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${quantity !== 1 ? `${quantity}x ` : ''}:${
            itemInfo?.tag
          }: ${itemID}, _worth about ${itemInfo?.intended_value_gp ?? NaN} gp${
            quantity !== 1 ? ' each' : ''
          }_`,
        },
      }
    }),
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Total value: :-gp: ${crateValue(crate)}`,
        },
      ],
    },
  ]

  const itemsToGive = [...selectedCrate.entries()].map(
    ([itemID, quantity]) => ({ itemID, quantity })
  )
  const hadEnoughItems = await giveItems(userID, itemsToGive)

  if (!hadEnoughItems) {
    const notEnoughItemsMessage = `_One by one, the items in the ${
      ['first', 'second', 'third'][selectedCrateIndex]
    } crate inexplicably vanish. Zara raises an eyebrow._ Interesting. _Zara hands you your ${cost} :-gp: back._`
    await client.chat.postMessage({
      ...messageInfo,
      text: notEnoughItemsMessage.replace(/_/g, ''),
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: notEnoughItemsMessage,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `The items originally selected for you are no longer available, someone else must have taken them.`,
            },
          ],
        },
      ],
    })
    const refundSuccessful = await giveItems(userID, [
      { itemID: 'gp', quantity: cost },
    ])
    if (!refundSuccessful) {
      const refundFailedMessage = `_Zara looks at you apolegetially._ I'm sorry, I couldn't return your ${cost} :-gp:`
      await client.chat.postMessage({
        ...messageInfo,
        text: refundFailedMessage.replace(/_/g, ''),
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: refundFailedMessage,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `The bot doesn't have enough :-gp: to refund you, either. This shouldn't happen. Please let <@U06UYA5GMB5> know that <@${botID}> couldn't refund ${cost} :-gp:.`,
              },
            ],
          },
        ],
      })
    }
    return
  }

  client.chat.update({
    ...messageInfo,
    ts: selectCrateMessage.ts!,
    text: selectQuestion.replace(/_/g, ''),
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: selectQuestion,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `> You selected crate ${selectedCrateIndex + 1}`,
        },
      },
    ],
  })

  const selectedCrateMessage = `_Zara nods, her eyes twinkling._ A wise choice. _She hands you the ${
    ['first', 'second', 'third'][selectedCrateIndex]
  } crate. You open it, and inside you find..._`

  const crateContentsMessage = await client.chat.postMessage({
    ...messageInfo,
    text: selectedCrateMessage.replace(/_/g, ''),
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: selectedCrateMessage,
        },
      },
      ...makeCrateContentsBlocks(selectedCrate),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `_Zara smiles, satisfied._ I do hope you return again soon.`,
        },
      },
    ],
  })

  for (let i = 0; i < hintMessages.length; i++) {
    client.chat.update({
      ...messageInfo,
      ts: hintMessages[i].ts!,
      text: hintParts[i].replace(/_/g, ''),
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `Crate ${i + 1}${
              i === selectedCrateIndex ? ' (selected)' : ''
            }`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: hintParts[i],
          },
        },
        ...makeCrateContentsBlocks(crates[i]),
        {
          type: 'divider',
        },
      ],
    })
  }
})

await app.start()
