import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from './config'

export type Role = 'user' | 'admin'
export type Status = 'pending' | 'approved' | 'rejected'

export interface UserProfile {
  displayName: string
  email: string
  photoURL: string
  role: Role
  status: Status
  createdAt?: Timestamp
  reviewedBy?: string
  reviewedAt?: Timestamp
}

interface AuthState {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  error: string | null
  login: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let unsubProfile: (() => void) | undefined

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      unsubProfile?.()
      unsubProfile = undefined
      setUser(u)
      setError(null)

      if (!u) {
        setProfile(null)
        setLoading(false)
        return
      }

      const ref = doc(db, 'users', u.uid)
      try {
        // Pierwsze logowanie: reguły wymuszają dokładnie role=user, status=pending.
        if (!(await getDoc(ref)).exists()) {
          await setDoc(ref, {
            displayName: u.displayName ?? '',
            email: u.email ?? '',
            photoURL: u.photoURL ?? '',
            role: 'user',
            status: 'pending',
            createdAt: serverTimestamp(),
          })
        }
        unsubProfile = onSnapshot(
          ref,
          (snap) => {
            setProfile(snap.exists() ? (snap.data() as UserProfile) : null)
            setLoading(false)
          },
          (e) => {
            setError(e.message)
            setLoading(false)
          },
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      }
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

  return (
    <AuthContext.Provider value={{ user, profile, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth poza AuthProvider')
  return ctx
}
