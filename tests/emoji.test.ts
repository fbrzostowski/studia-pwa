import { describe, expect, it } from 'vitest'
import { EMOJI_CHOICES, normalizeEmoji } from '../src/lib/emoji'

describe('normalizeEmoji', () => {
  it('przyjmuje pojedynczą emotkę, także złożoną', () => {
    expect(normalizeEmoji('📚')).toBe('📚')
    expect(normalizeEmoji(' 🇪🇸 ')).toBe('🇪🇸')
    expect(normalizeEmoji('👨‍💻')).toBe('👨‍💻')
    expect(normalizeEmoji('✏️')).toBe('✏️')
  })
  it('odrzuca tekst, kilka emotek i puste pole', () => {
    expect(normalizeEmoji('')).toBeNull()
    expect(normalizeEmoji('   ')).toBeNull()
    expect(normalizeEmoji('a')).toBeNull()
    expect(normalizeEmoji('📚📖')).toBeNull()
    expect(normalizeEmoji('📚a')).toBeNull()
    expect(normalizeEmoji('1')).toBeNull()
  })
  it('każda podpowiedź przechodzi walidację', () => {
    for (const e of EMOJI_CHOICES) expect(normalizeEmoji(e), e).toBe(e)
  })
})
