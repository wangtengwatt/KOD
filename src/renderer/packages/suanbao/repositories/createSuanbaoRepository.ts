import { IndexedDBSuanbaoRepository } from './IndexedDBSuanbaoRepository'
import { MemorySuanbaoRepository } from './MemorySuanbaoRepository'
import type { SuanbaoRepository } from './SuanbaoRepository'

const repositories = new Map<string, SuanbaoRepository>()

export function getSuanbaoRepository(accountKey: string): SuanbaoRepository {
  let repository = repositories.get(accountKey)
  if (!repository) {
    repository =
      process.env.NODE_ENV === 'test' ? new MemorySuanbaoRepository() : new IndexedDBSuanbaoRepository(accountKey)
    repositories.set(accountKey, repository)
  }
  return repository
}

export async function closeSuanbaoRepository(accountKey: string, expectedRepository?: SuanbaoRepository) {
  const repository = repositories.get(accountKey)
  if (!repository || (expectedRepository && repository !== expectedRepository)) return
  repositories.delete(accountKey)
  await repository.close()
}
