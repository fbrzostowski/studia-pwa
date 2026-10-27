const PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u

/** Jedna emotka (jeden grafem, np. 📚, 🇪🇸, 👨‍💻) albo null, gdy tekst nią nie jest. Obcina otaczające spacje. */
export function normalizeEmoji(input: string): string | null {
  const t = input.trim()
  if (!t) return null
  const seg = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)]
  if (seg.length !== 1 || !PICTO.test(t)) return null
  return t
}

/** Podpowiedzi w selektorze ikony przedmiotu. */
export const EMOJI_CHOICES = [
  '📚', '📖', '📝', '✏️', '🎓', '🧮', '📐', '📊', '📈', '💹',
  '💰', '💵', '🏦', '🧾', '⚖️', '📜', '🏛️', '🤝', '📣', '🛒',
  '🌍', '🗺️', '🌐', '🧠', '🔬', '🧪', '💻', '🖥️', '🤖', '📡',
  '🗣️', '💬', '🇬🇧', '🇪🇸', '🇩🇪', '🇫🇷', '🇮🇹', '🇵🇱', '🏀', '⚽',
  '🏃', '🏋️', '🎨', '🎵', '🎭', '📷', '🏭', '🚚', '🏢', '🌱',
  '⚡', '🔥', '⭐', '🍀', '🦉', '☕',
]
