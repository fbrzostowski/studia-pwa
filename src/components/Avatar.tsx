import { useState } from 'react'

const HUES = [12, 32, 150, 190, 215, 255, 285, 330]

function hueFor(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return HUES[h % HUES.length]
}

/** Miniaturka osoby: zdjęcie profilu albo, gdy go brak lub się nie wczytało, kółko z inicjałem. */
export default function Avatar({
  name,
  photoURL,
  size = 24,
  className = '',
}: {
  name: string
  photoURL?: string
  size?: number
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const style = { width: size, height: size }
  if (photoURL && !broken) {
    return (
      <img
        src={photoURL}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setBroken(true)}
        style={style}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: size * 0.45, background: `hsl(${hueFor(name)} 45% 42%)` }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}
