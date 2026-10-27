import FolderIcon from './FolderIcon'

/** Ikona przedmiotu: jego emotka albo, gdy jej nie ustawiono, folder. Zajmuje zawsze kwadrat `size` px. */
export default function SubjectIcon({ emoji, size = 36 }: { emoji?: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.78, lineHeight: 1 }}
      className="flex shrink-0 items-center justify-center"
    >
      {emoji ? emoji : <FolderIcon className="text-accent h-full w-full" />}
    </span>
  )
}
