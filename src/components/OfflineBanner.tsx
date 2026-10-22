import { useEffect, useState } from 'react'

export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (online) return null
  return (
    <div
      className="bg-amber-100 px-4 py-1.5 text-center text-sm text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
      role="status"
    >
      Brak połączenia — pokazuję ostatnio pobrane dane.
    </div>
  )
}
