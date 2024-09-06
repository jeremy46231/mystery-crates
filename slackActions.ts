import type Slack from '@slack/bolt'
import { nanoid } from 'nanoid'

type eventPromise<Args extends unknown = any> = {
  date: Date
  authorizedUser?: string
  expectedType?: Slack.SlackActionMiddlewareArgs['action']['type']
  resolve: (args?: Args) => void
}
const closures = new Map<string, eventPromise>()
export function createEventPromise<Action extends Slack.SlackAction>(
  authorizedUser?: string,
  expectedType?: Slack.SlackActionMiddlewareArgs['action']['type']
) {
  const id = nanoid()
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

export async function addSlackActionListener(app: Slack.App) {
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
    closures.delete(params.action.action_id)
  })
}
