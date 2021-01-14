import * as sdk from 'botpress/sdk'
import _ from 'lodash'

const outgoingTypes = ['text', 'typing', 'login_prompt', 'file', 'carousel', 'custom', 'data']

export default async (bp: typeof sdk) => {
  bp.events.registerMiddleware({
    description:
      'Sends out messages that targets platform = webchat.' +
      ' This middleware should be placed at the end as it swallows events once sent.',
    direction: 'outgoing',
    handler: outgoingHandler,
    name: 'web.sendMessages',
    order: 100
  })

  async function outgoingHandler(event: sdk.IO.OutgoingEvent, next: sdk.IO.MiddlewareNextCallback) {
    if (event.channel !== 'web') {
      return next()
    }

    const messageType = event.type === 'default' ? 'text' : event.type
    const userId = event.target
    const botId = event.botId
    const conversationId = +event.threadId || (await bp.messaging.getOrCreateRecentConversation({ userId, botId })).id

    if (!_.includes(outgoingTypes, messageType)) {
      bp.logger.warn(`Unsupported event type: ${event.type}`)
      return next(undefined, true)
    }

    const standardTypes = ['text', 'carousel', 'custom', 'file', 'login_prompt']

    if (!event.payload.type) {
      event.payload.type = messageType
    }

    if (messageType === 'typing') {
      const typing = parseTyping(event.payload.value)
      const payload = bp.RealTimePayload.forVisitor(userId, 'webchat.typing', { timeInMs: typing, conversationId })
      // Don't store "typing" in DB
      bp.realtime.sendPayload(payload)
      // await Promise.delay(typing)
    } else if (messageType === 'data') {
      const payload = bp.RealTimePayload.forVisitor(userId, 'webchat.data', event.payload)
      bp.realtime.sendPayload(payload)
    } else if (standardTypes.includes(messageType)) {
      const message = await bp.messaging.appendMessage(conversationId, event.id, event.incomingEventId, event.payload)
      bp.realtime.sendPayload(bp.RealTimePayload.forVisitor(userId, 'webchat.message', message))
    } else {
      bp.logger.warn(`Message type "${messageType}" not implemented yet`)
    }

    next(undefined, false)
    // TODO Make official API (BotpressAPI.events.updateStatus(event.id, 'done'))
  }
}

function parseTyping(typing) {
  if (isNaN(typing)) {
    return 1000
  }

  return Math.max(typing, 500)
}
