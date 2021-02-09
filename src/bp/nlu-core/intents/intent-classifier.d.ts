import { Intent, ListEntityModel, PatternEntity } from 'nlu-core/typings'
import Utterance from 'nlu-core/utterance/utterance'

export interface IntentTrainInput {
  languageCode: string
  list_entities: ListEntityModel[]
  pattern_entities: PatternEntity[]
  intents: Intent<Utterance>[]
  nluSeed: number
}

export interface IntentPrediction {
  name: string
  confidence: number
  extractor: string
}
export interface IntentPredictions {
  intents: IntentPrediction[]
}
export interface NoneableIntentPredictions extends IntentPredictions {
  oos: number
}

export interface IntentClassifier {
  train(trainInput: IntentTrainInput, progress: (p: number) => void): Promise<void>
  serialize(): string
  load(model: string): void
  predict(utterance: Utterance): Promise<IntentPredictions>
}
export interface NoneableIntentClassifier {
  predict(utterance: Utterance): Promise<NoneableIntentPredictions>
}
