// Logika gestu przesuwanego arkusza, oparta na wytycznych „Designing Fluid Interfaces” (skill apple-design).

/** Gdzie ruch z pędem wylądowałby sam (zanikanie wykładnicze jak przy przewijaniu); prędkość w px/s. */
export const project = (velocity: number, decelerationRate = 0.998) =>
  ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)

/** Miękka granica: im dalej za krawędzią, tym słabiej element podąża za palcem. */
export const rubberband = (overshoot: number, dimension: number, constant = 0.55) =>
  (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))

/** Prędkość pionowa (px/s) z ostatnich próbek; jeśli palec stał przed puszczeniem, wynosi 0. */
export function releaseVelocity(samples: { t: number; y: number }[], now: number, windowMs = 100) {
  const recent = samples.filter((s) => now - s.t <= windowMs)
  if (recent.length < 2) return 0
  const first = recent[0]
  const last = recent[recent.length - 1]
  const dt = (last.t - first.t) / 1000
  return dt > 0 ? (last.y - first.y) / dt : 0
}

export type Release = 'dismiss' | 'snap'

/**
 * Zamknąć czy wrócić? O kierunku decyduje znak prędkości, nie sama pozycja: szybki ruch w dół zamyka,
 * w górę cofa; przy wolnym puszczeniu liczy się rzutowany punkt spoczynku (ponad połowa wysokości).
 */
export function decideRelease({ offset, velocity, height }: { offset: number; velocity: number; height: number }): Release {
  if (offset <= 0) return 'snap'
  if (velocity < -300) return 'snap'
  if (velocity > 800) return 'dismiss'
  return offset + project(velocity) > height * 0.5 ? 'dismiss' : 'snap'
}
