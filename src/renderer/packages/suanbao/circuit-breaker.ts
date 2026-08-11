export interface SuanbaoCircuitBreakerOptions {
  threshold: number
  windowMs: number
  now?: () => number
}

export class SuanbaoCircuitBreaker {
  private failures: number[] = []
  private broken = false
  private readonly now: () => number

  constructor(private readonly options: SuanbaoCircuitBreakerOptions) {
    if (!Number.isInteger(options.threshold) || options.threshold < 1) throw new Error('threshold must be positive')
    if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) throw new Error('windowMs must be positive')
    this.now = options.now ?? Date.now
  }

  recordFailure(): boolean {
    if (this.broken) return true
    const currentTime = this.now()
    this.failures = this.failures.filter((time) => currentTime - time <= this.options.windowMs)
    this.failures.push(currentTime)
    this.broken = this.failures.length >= this.options.threshold
    return this.broken
  }

  isBroken(): boolean {
    return this.broken
  }

  reset(): void {
    this.failures = []
    this.broken = false
  }
}
