import type {
  SuanbaoLocalCalendarEvent,
  SuanbaoOperation,
  SuanbaoPomodoroSession,
  SuanbaoReminder,
  SuanbaoTodoItem,
} from '@shared/types/suanbao'

export type SuanbaoEntity = SuanbaoTodoItem | SuanbaoReminder | SuanbaoPomodoroSession | SuanbaoLocalCalendarEvent

export interface SuanbaoRepository {
  initialize(): Promise<void>
  close(): Promise<void>
  getOperation(id: string): Promise<SuanbaoOperation | null>
  getOperationByIdempotencyKey(key: string): Promise<SuanbaoOperation | null>
  getLatestAwaitingOperation(): Promise<SuanbaoOperation | null>
  saveOperation(operation: SuanbaoOperation): Promise<void>
  executeOperation(operation: SuanbaoOperation, entity: SuanbaoEntity): Promise<SuanbaoOperation>

  listTodos(): Promise<SuanbaoTodoItem[]>
  getTodo(id: string): Promise<SuanbaoTodoItem | null>
  saveTodo(todo: SuanbaoTodoItem): Promise<void>
  deleteTodo(id: string): Promise<void>

  listReminders(): Promise<SuanbaoReminder[]>
  listScheduledReminders(before?: number): Promise<SuanbaoReminder[]>
  getReminder(id: string): Promise<SuanbaoReminder | null>
  saveReminder(reminder: SuanbaoReminder): Promise<void>
  deleteReminder(id: string): Promise<void>

  listPomodoros(): Promise<SuanbaoPomodoroSession[]>
  getPomodoro(id: string): Promise<SuanbaoPomodoroSession | null>
  getActivePomodoro(): Promise<SuanbaoPomodoroSession | null>
  savePomodoro(session: SuanbaoPomodoroSession): Promise<void>

  listCalendarEvents(range?: { from: number; to: number }): Promise<SuanbaoLocalCalendarEvent[]>
  getCalendarEvent(id: string): Promise<SuanbaoLocalCalendarEvent | null>
  saveCalendarEvent(event: SuanbaoLocalCalendarEvent): Promise<void>
  deleteCalendarEvent(id: string): Promise<void>

  clearAll(): Promise<void>
  deleteDatabase(): Promise<void>
}

export const entityStoreName = (entity: SuanbaoEntity) => {
  if ('completed' in entity && !('completedWorkCycles' in entity)) return 'todos'
  if ('triggerAt' in entity) return 'reminders'
  if ('completedWorkCycles' in entity) return 'pomodoros'
  return 'local-calendar-events'
}
