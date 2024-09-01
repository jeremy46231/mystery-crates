import { OpenAI, RateLimitError } from 'openai'
import env from './env.ts'

// 15 per minute
const gemini = new OpenAI({
  ...env.geminiProxy,
})
// 500 per month
const openAIGateway = new OpenAI({
  ...env.openAIGateway,
})

const clients = [
  // {
  //   name: 'Gemini',
  //   client: gemini,
  //   model: 'google/gemini-1.5-flash',
  // },
  {
    name: 'Hack Club OpenAI Gateway',
    client: openAIGateway,
    model: 'gpt-4o',
  },
]

/**
 * Wrapper around client.chat.completions.create that falls back if rate limited
 */
export const chatCompletionsCreate = ((
  body: Omit<OpenAI.ChatCompletionCreateParams, 'model'>,
  options?: OpenAI.RequestOptions
) => {
  let lastError: Error | null = null
  for (const client of clients) {
    try {
      return client.client.chat.completions.create(
        {
          ...body,
          model: client.model,
        },
        {
          maxRetries: 0,
          ...options,
        }
      )
    } catch (error) {
      if (!(error instanceof RateLimitError)) {
        throw error
      }
      console.warn(`${client.name} is rate limited`, error)
      lastError = error
    }
  }
  console.error('All clients are rate limited')
  //throw lastError
}) as OpenAI.Chat.Completions['create']

async function test() {
  for (const client of clients) {
    try {
      const response = await client.client.chat.completions.create({
        model: client.model,
        messages: [
          {
            role: 'system',
            content:
              'You speak like Shakespeare and are obsessed with the Golden Gate Bridge, mentioning it in every sentence without fail.',
          },
          { role: 'user', content: 'How is the weather today?' },
        ],
      })
      console.log(
        `${client.name} responded:`,
        response.choices[0].message.content
      )
    } catch (error) {
      console.error(`${client.name} failed`, error)
    }
  }
}
// test()
