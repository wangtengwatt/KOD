interface PackageDurationSource {
  packageDurationHours?: number | null
  startTime?: string | null
  endTime?: string | null
}

function positiveHours(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function resolvePackageDurationHours(source: PackageDurationSource, productDurationHours?: number | null) {
  const configured = positiveHours(source.packageDurationHours) ?? positiveHours(productDurationHours)
  if (configured) return configured

  const start = source.startTime ? new Date(source.startTime).getTime() : Number.NaN
  const end = source.endTime ? new Date(source.endTime).getTime() : Number.NaN
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return (end - start) / 3_600_000
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

export function addHoursToLocalDateTime(value: string, hours: number | null) {
  if (!value || !hours || !Number.isFinite(hours) || hours <= 0) return ''
  const start = new Date(value)
  if (Number.isNaN(start.getTime())) return ''

  const end = new Date(start.getTime() + hours * 3_600_000)
  return `${end.getFullYear()}-${padDatePart(end.getMonth() + 1)}-${padDatePart(end.getDate())}T${padDatePart(end.getHours())}:${padDatePart(end.getMinutes())}`
}
