import Slack from '@slack/bolt'
import env from './env'
import {
  generateCrateHint,
  generateCrates,
  crateValue,
  type crate,
} from './crates'
import { getItemInfo } from './bag'

const app = new Slack.App({
  ...env.slack,
  socketMode: true,
})

type eventPromise<Args extends unknown = any> = {
  date: Date
  authorizedUser?: string
  expectedType?: Slack.SlackActionMiddlewareArgs['action']['type']
  resolve: (args?: Args) => void
}
const closures = new Map<string, eventPromise>()
function createEventPromise<Action extends Slack.SlackAction>(
  authorizedUser?: string,
  expectedType?: Slack.SlackActionMiddlewareArgs['action']['type']
) {
  const id = String(Math.round(Math.random() * 1e9))
  const promise = new Promise<Slack.SlackActionMiddlewareArgs<Action>>(
    (resolve) => {
      closures.set(id, {
        date: new Date(),
        authorizedUser,
        expectedType,
        resolve,
      })
    }
  )
  return [id, promise] as const
}
app.action({}, async (params) => {
  if (!('action_id' in params.action))
    throw new Error(
      `Don't know how to handle action ${params.action.type} without an action_id`
    )
  const promise = closures.get(params.action.action_id)
  const showError = async (message: string) => {
    await params.ack()
    if (params.body.channel && params.body.channel.id) {
      await params.client.chat.postEphemeral({
        channel: params.body.channel.id,
        user: params.body.user.id,
        text: message,
      })
      return
    }
    await params.client.chat.postMessage({
      channel: params.body.user.id,
      text: message,
    })
  }

  if (!promise) return await showError('This action has expired')
  if (promise.expectedType && promise.expectedType !== params.action.type) {
    await showError(
      `Expected action type ${promise.expectedType}, but got ${params.action.type}`
    )
    throw new Error(
      `Expected action type ${promise.expectedType}, but got ${params.action.type}`
    )
  }
  if (
    promise.authorizedUser &&
    params.body.user.id !== promise.authorizedUser
  ) {
    return await showError('You are not authorized to perform this action')
  }

  promise.resolve(params)
})

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

///////////////////////////////
////////// Main code //////////
///////////////////////////////

app.event('app_mention', async ({ event, client }) => {
  const userID = event.user
  const messageInfo = {
    username: 'Zara',
    channel: event.channel,
    thread_ts: event.ts,
  }

  const crates = await generateCrates()
  const values = crates.map(crateValue)
  const averageValue = values.reduce((a, b) => a + b, 0) / values.length
  const maxValue = Math.max(...values)

  const cost = Math.round((averageValue + maxValue) / 2)

  const generateHintPromise = generateCrateHint(crates)

  const costMessage = `_Zara eyes the player with a sly smile, her green hat tilting slightly._ Curiosity comes at a price. _Her voice is almost a whisper._ A few coins, and the game is yours.`
  const [payButtonId, payButtonPromise] = createEventPromise<
    Slack.BlockAction<Slack.ButtonAction>
  >(userID, 'button')

  await client.chat.postMessage({
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
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: `:-gp: ${cost}`,
              emoji: true,
            },
            action_id: payButtonId,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Note: I haven't gotten write permissions set up, so this won't charge you or give you any items yet.`,
          },
        ],
      },
    ],
  })

  const payButtonResponse = await payButtonPromise
  payButtonResponse.ack()

  payButtonResponse.respond({
    replace_original: true,
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
    ...[...crate.entries()].map(([itemId, quantity]) => {
      const itemInfo = getItemInfo(itemId)
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${quantity !== 1 ? `${quantity}x ` : ''}:${
            itemInfo?.tag
          }: ${itemId}, _worth about ${
            (itemInfo?.intended_value_gp ?? NaN) * quantity
          } gp${quantity !== 1 ? ' each' : ''}_`,
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
            text: `Crate ${i + 1}${i === selectedCrateIndex ? ' (selected)' : ''}`,
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
