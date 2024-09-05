import 'dotenv/config'

function getEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Environment variable ${key} is required`)
  }
  return value
}

const slack = {
  token: getEnv('SLACK_BOT_TOKEN'),
  appToken: getEnv('SLACK_APP_TOKEN'),
  signingSecret: getEnv('SLACK_SIGNING_SECRET'),
}

const bag = {
  appId: Number(getEnv('BAG_APP_ID')),
  key: getEnv('BAG_APP_TOKEN'),
}
const bagAccountID = getEnv('BAG_ACCOUNT_ID')

const geminiProxy = {
  apiKey: getEnv('GEMINI_API_KEY'),
  baseURL: getEnv('GEMINI_PROXY_BASE_URL'),
}
const openAIGateway = {
  apiKey: getEnv('OPENAI_GATEWAY_API_KEY'),
  baseURL: getEnv('OPENAI_GATEWAY_BASE_URL'),
}

export default { slack, bag, bagAccountID, geminiProxy, openAIGateway }
