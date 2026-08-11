import { describe, expect, it } from 'vitest'
import {
  advancePomodoro,
  createPomodoroSession,
  pausePomodoro,
  recoverPomodoro,
  resumePomodoro,
  stopPomodoro,
} from './pomodoro'

describe('pomodoro state machine', () => {
  it('pauses and resumes from an absolute end time', () => {
    const started = createPomodoroSession('p1', 60_000, 1_000)
    const paused = pausePomodoro(started, 21_000)
    expect(paused).toMatchObject({ status: 'paused', remainingMs: 40_000, endsAt: undefined })
    const resumed = resumePomodoro(paused, 31_000)
    expect(resumed).toMatchObject({ status: 'running', endsAt: 71_000, remainingMs: undefined })
  })

  it('advances work cycles and uses a long break every fourth cycle', () => {
    let session = createPomodoroSession('p1', 25 * 60_000, 0)
    for (let cycle = 1; cycle <= 4; cycle += 1) {
      session = advancePomodoro(session, cycle * 1_000, { shortBreakMs: 100, longBreakMs: 400 })
      expect(session.phase).toBe(cycle === 4 ? 'long-break' : 'short-break')
      if (cycle < 4) session = advancePomodoro(session, cycle * 1_000 + 100)
    }
    expect(session.completedWorkCycles).toBe(4)
    expect(session.durationMs).toBe(400)
  })

  it('recovers expired phases without persisted tick counters', () => {
    const started = createPomodoroSession('p1', 1_000, 0)
    const recovered = recoverPomodoro(started, 1_400, { shortBreakMs: 500 })
    expect(recovered).toMatchObject({ phase: 'short-break', status: 'running', endsAt: 1_500 })
    const next = recoverPomodoro(recovered, 1_600, { shortBreakMs: 500 })
    expect(next.phase).toBe('work')
  })

  it('stops idempotently', () => {
    const stopped = stopPomodoro(createPomodoroSession('p1', 1_000, 0), 100)
    expect(stopPomodoro(stopped, 200)).toEqual(stopped)
  })
})
