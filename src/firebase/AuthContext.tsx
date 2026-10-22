import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch, type Timestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from './config'

export type Role = 'user' | 'admin'
export type Status = 'pending' | 'approved' | 'rejected'

export interface UserProfile {
  username?: string
  displayName: string
  email: string
  photoURL: string
  role: Role
  status: Status
  createdAt?: Timestamp
  reviewedBy?: string
  reviewedAt?: Timestamp
}

// Zgodne z regułami Firestore (users create).
export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,20}$/

/** Nazwa zapisywana w członkostwach; musi zgadzać się z regułą (username, a w starszych kontach nazwa z Google). */
export const memberName = (p: Pick<UserProfile, 'username' | 'displayName'>) => p.username ?? p.displayName ?? ''

/** Nazwa do pokazywania innym: username, a dla starszych kont nazwa z Google. */
export const shownName = (p: Pick<UserProfile, 'username' | 'displayName' | 'email'>) =>
  p.username || p.displayName || p.email

interface AuthState {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  error: string | null
  login: () => Promise<void>
  logout: () => Promise<void>
  createProfile: (username: string) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let unsubProfile: (() => void) | undefined

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      unsubProfile?.()
      unsubProfile = undefined
      setUser(u)
      setError(null)

      if (!u) {
        setProfile(null)
        setLoading(false)
        return
      }

      // Brak dokumentu = nowe konto: profile === null po załadowaniu pokazuje wybór nazwy.
      setLoading(true)
      unsubProfile = onSnapshot(
        doc(db, 'users', u.uid),
        (snap) => {
          setProfile(snap.exists() ? (snap.data() as UserProfile) : null)
          setLoading(false)
        },
        (e) => {
          setError(e.message)
          setLoading(false)
        },
      )
    })

    return () => {
      unsubAuth()
      unsubProfile?.()
    }
  }, [])

  const login = async () => {
    setError(null)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const logout = () => signOut(auth)

  // Rezerwacja nazwy (usernames/{małymi}) i profil lądują w jednej paczce — reguły sprawdzają je razem.
  const createProfile = async (username: string) => {
    if (!user) throw new Error('Nie jesteś zalogowany.')
    if (!USERNAME_RE.test(username)) {
      throw new Error('Nazwa: 3–20 znaków, litery bez polskich znaków, cyfry oraz _ . -')
    }
    const nameRef = doc(db, 'usernames', username.toLowerCase())
    if ((await getDoc(nameRef)).exists()) throw new Error('Ta nazwa jest już zajęta.')

    const batch = writeBatch(db)
    batch.set(nameRef, { uid: user.uid, createdAt: serverTimestamp() })
    batch.set(doc(db, 'users', user.uid), {
      username,
      displayName: user.displayName ?? '',
      email: user.email ?? '',
      photoURL: user.photoURL ?? '',
      role: 'user',
      status: 'pending',
      createdAt: serverTimestamp(),
    })
    try {
      await batch.commit()
    } catch (e) {
      const code = (e as { code?: string }).code
      throw new Error(
        code === 'permission-denied'
          ? 'Nie udało się zająć tej nazwy — mogła zostać właśnie zajęta. Spróbuj innej.'
          : e instanceof Error
            ? e.message
            : String(e),
      )
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, error, login, logout, createProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth poza AuthProvider')
  return ctx
}
