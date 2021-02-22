import { experimental } from 'botpress/sdk'
import { JobService } from 'core/services/job-service'
import { inject, injectable, postConstruct } from 'inversify'

import LRU from 'lru-cache'
import ms from 'ms'
import Database from '../database'
import { TYPES } from '../types'

export interface MessageRepository {
  list(filters: experimental.messages.ListFilters): Promise<experimental.Message[]>
  deleteAll(conversationId: number): Promise<number>
  create(args: experimental.messages.CreateArgs): Promise<experimental.Message>
  get(messageId: number): Promise<experimental.Message | undefined>
  delete(messageId: number): Promise<boolean>
  serialize(message: Partial<experimental.Message>)
  deserialize(message: any): experimental.Message | undefined
}

@injectable()
export class KnexMessageRepository implements MessageRepository {
  private readonly TABLE_NAME = 'messages'
  private cache = new LRU<number, experimental.Message>({ max: 10000, maxAge: ms('5min') })
  private invalidateMsgCache: (ids: number[]) => void = this._localInvalidateMsgCache

  constructor(
    @inject(TYPES.Database) private database: Database,
    @inject(TYPES.JobService) private jobService: JobService
  ) {}

  @postConstruct()
  async init() {
    this.invalidateMsgCache = <any>await this.jobService.broadcast<void>(this._localInvalidateMsgCache.bind(this))
  }

  public async list(filters: experimental.messages.ListFilters): Promise<experimental.Message[]> {
    const { conversationId, limit, offset } = filters

    let query = this.query()
      .where({ conversationId })
      .orderBy('sentOn', 'desc')

    if (limit) {
      query = query.limit(limit)
    }

    if (offset) {
      query = query.offset(offset)
    }

    return (await query).map(x => this.deserialize(x)!)
  }

  public async deleteAll(conversationId: number): Promise<number> {
    const deletedIds = (
      await this.query()
        .select('id')
        .where({ conversationId })
    ).map(x => x.id)

    if (deletedIds.length) {
      await this.query()
        .where({ conversationId })
        .del()

      this.invalidateMsgCache(deletedIds)
    }

    return deletedIds.length
  }

  public async create(args: experimental.messages.CreateArgs): Promise<experimental.Message> {
    const { conversationId, eventId, incomingEventId, from, payload } = args

    const row = {
      conversationId,
      eventId,
      incomingEventId,
      from,
      sentOn: new Date(),
      payload
    }

    const id = await this.database.knex.insertAndGetId(this.TABLE_NAME, this.serialize(row))
    const message = {
      id,
      ...row
    }
    this.cache.set(id, message)

    return message
  }

  public async get(messageId: number): Promise<experimental.Message | undefined> {
    const cached = this.cache.get(messageId)
    if (cached) {
      return cached
    }

    const rows = await this.query()
      .select('*')
      .where({ id: messageId })

    const message = this.deserialize(rows[0])
    if (message) {
      this.cache.set(messageId, message)
    }

    return message
  }

  public async delete(messageId: number): Promise<boolean> {
    const numberOfDeletedRows = await this.query()
      .where({ id: messageId })
      .del()

    this.invalidateMsgCache([messageId])

    return numberOfDeletedRows > 0
  }

  private query() {
    return this.database.knex(this.TABLE_NAME)
  }

  public serialize(message: Partial<experimental.Message>) {
    const { conversationId, eventId, incomingEventId, from, sentOn, payload } = message
    return {
      conversationId,
      eventId,
      incomingEventId,
      from,
      sentOn: this.database.knex.date.set(sentOn),
      payload: this.database.knex.json.set(payload)
    }
  }

  public deserialize(message: any): experimental.Message | undefined {
    if (!message) {
      return undefined
    }

    const { id, conversationId, eventId, incomingEventId, from, sentOn, payload } = message
    return {
      id,
      conversationId,
      eventId,
      incomingEventId,
      from,
      sentOn: this.database.knex.date.get(sentOn),
      payload: this.database.knex.json.get(payload)
    }
  }

  private _localInvalidateMsgCache(ids: number[]) {
    ids?.forEach(id => this.cache.del(id))
  }
}
