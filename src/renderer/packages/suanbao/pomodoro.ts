import type { SuanbaoPomodoroSession } from '@shared/types/suanbao'

export const DEFAULT_SHORT_BREAK_MS = 5 * 60_000
export const DEFAULT_LONG_BREAK_MS = 15 * 60_000

export interface PomodoroDurations {
  shortBreakMs?: number
  longBreakMs?: number
}

const update = (
  session: SuanbaoPomodoroSession,
  now: number,
  changes: Partial<SuanbaoPomodoroSession>
): SuanbaoPomodoroSession => ({
  ...session,
  ...changes,
  updatedAt: now,
  revision: session.revision + 1,
})

export function createPomodoroSession(id: string, durationMs: number, now = Date.now()): SuanbaoPomodoroSession {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('SUANBAO_INVALID_POMODORO_DURATION')
  return {
    id,
    phase: 'work',
    status: 'running',
    durationMs,
    startedAt: now,
    endsAt: now + durationMs,
    completedWorkCycles: 0,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  }
}

export function pausePomodoro(session: SuanbaoPomodoroSession, now = Date.now()): SuanbaoPomodoroSession {
  if (session.status !== 'running' || session.endsAt === undefined) throw new Error('SUANBAO_POMODORO_NOT_RUNNING')
  return update(session, now, {
    status: 'paused',
    endsAt: undefined,
    remainingMs: Math.max(0, session.endsAt - now),
  })
}

export function resumePomodoro(session: SuanbaoPomodoroSession, now = Date.now()): SuanbaoPomodoroSession {
  if (session.status !== 'paused') throw new Error('SUANBAO_POMODORO_NOT_PAUSED')
  const remainingMs = Math.max(0, session.remainingMs ?? session.durationMs)
  return update(session, now, {
    status: 'running',
    startedAt: now,
    endsAt: now + remainingMs,
    remainingMs: undefined,
  })
}

export function stopPomodoro(session: SuanbaoPomodoroSession, now = Date.now()): SuanbaoPomodoroSession {
  if (session.status === 'completed' || session.status === 'cancelled') return session
  return update(session, now, {
    status: 'cancelled',
    endsAt: undefined,
    remainingMs: undefined,
    completedAt: now,
  })
}

export function advancePomodoro(
  session: SuanbaoPomodoroSession,
  now = Date.now(),
  durations: PomodoroDurations = {}
): SuanbaoPomodoroSession {
  if (session.status === 'completed' || session.status === 'cancelled') return session
  const completedWorkCycles = session.phase === 'work' ? session.completedWorkCycles + 1 : session.completedWorkCycles
  const nextPhase = session.phase === 'work' ? (completedWorkCycles % 4 === 0 ? 'long-break' : 'short-break') : 'work'
  const durationMs =
    nextPhase === 'work'
      ? session.durationMs
      : nextPhase === 'long-break'
        ? (durations.longBreakMs ?? DEFAULT_LONG_BREAK_MS)
        : (durations.shortBreakMs ?? DEFAULT_SHORT_BREAK_MS)
  return update(session, now, {
    phase: nextPhase,
    status: 'running',
    durationMs,
    startedAt: now,
    endsAt: now + durationMs,
    remainingMs: undefined,
    completedWorkCycles,
    completedAt: undefined,
  })
}

export function recoverPomodoro(
  session: SuanbaoPomodoroSession,
  now = Date.now(),
  durations: PomodoroDurations = {}
): SuanbaoPomodoroSession {
  let recovered = session
  let transitions = 0
  while (
    recovered.status === 'running' &&
    recovered.endsAt !== undefined &&
    recovered.endsAt <= now &&
    transitions < 100
  ) {
    recovered = advancePomodoro(recovered, recovered.endsAt, durations)
    transitions += 1
  }
  return recovered
}
