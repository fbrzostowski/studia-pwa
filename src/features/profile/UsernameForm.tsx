import { useState, type FormEvent } from 'react'
import { USERNAME_RE, useAuth } from '../../firebase/AuthContext'

// Pierwsze logowanie: użytkownik wybiera nazwę widoczną dla innych zamiast adresu e-mail.
export default function UsernameForm() {
  const { createProfile, logout } = useAuth()
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = USERNAME_RE.test(username)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await createProfile(username.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 text-left">
      <p className="text-muted text-center text-sm">Wybierz nazwę użytkownika, którą zobaczą inni.</p>
      <input
        autoFocus
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={20}
        className="input mt-4"
        placeholder="np. filip_b"
        value={username}
        onChange={(e) => setUsername(e.target.value.trim())}
        aria-describedby="username-hint"
      />
      <p id="username-hint" className="text-muted mt-1.5 text-xs">
        3–20 znaków: litery bez polskich znaków, cyfry oraz _ . -
      </p>
      {error && <p className="text-danger mt-2 text-sm">{error}</p>}
      <button disabled={!valid || busy} className="btn-primary mt-4 w-full">
        {busy ? 'Zapisuję…' : 'Dalej'}
      </button>
      <button type="button" className="btn-ghost mt-2 w-full" onClick={logout}>
        Wyloguj
      </button>
    </form>
  )
}
