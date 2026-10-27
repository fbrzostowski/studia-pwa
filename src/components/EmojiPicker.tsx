import { useState } from 'react'
import Sheet from './Sheet'
import { EMOJI_CHOICES, normalizeEmoji } from '../lib/emoji'

/** Wybór emotki dla przedmiotu: gotowa siatka podpowiedzi albo własna emotka wklejona z klawiatury. */
export default function EmojiPicker({
  open,
  subjectName,
  current,
  onPick,
  onClose,
}: {
  open: boolean
  subjectName: string
  current?: string
  onPick: (emoji: string | null) => void
  onClose: () => void
}) {
  const [custom, setCustom] = useState('')
  const clean = normalizeEmoji(custom)
  const invalid = custom.trim() !== '' && !clean

  return (
    <Sheet open={open} title={`Ikona: ${subjectName}`} onClose={onClose}>
      <p className="text-muted mb-3 text-sm">Widzą ją wszyscy, wszędzie tam, gdzie jest ten przedmiot.</p>
      <ul className="grid grid-cols-7 gap-1.5 sm:grid-cols-9" aria-label="Emotki">
        {EMOJI_CHOICES.map((e) => (
          <li key={e}>
            <button
              type="button"
              aria-pressed={current === e}
              aria-label={e}
              className="hover:bg-accent-soft aria-pressed:bg-accent-soft aria-pressed:ring-accent flex h-11 w-full items-center justify-center rounded-xl text-2xl aria-pressed:ring-2"
              onClick={() => onPick(e)}
            >
              {e}
            </button>
          </li>
        ))}
      </ul>

      <form
        className="mt-4 flex items-start gap-2"
        onSubmit={(ev) => {
          ev.preventDefault()
          if (clean) onPick(clean)
        }}
      >
        <div className="min-w-0 flex-1">
          <input
            className="input"
            placeholder="Własna emotka"
            value={custom}
            onChange={(ev) => setCustom(ev.target.value)}
            aria-invalid={invalid}
          />
          {invalid && <p className="text-danger mt-1 text-xs">To musi być jedna emotka.</p>}
        </div>
        <button className="btn-primary" disabled={!clean}>
          Ustaw
        </button>
      </form>

      {current && (
        <button type="button" className="btn-secondary mt-3 w-full" onClick={() => onPick(null)}>
          Wróć do ikony folderu
        </button>
      )}
    </Sheet>
  )
}
