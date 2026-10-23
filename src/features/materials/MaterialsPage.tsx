import { useState } from 'react'
import CalendarView from './CalendarView'
import SubjectsView from './SubjectsView'

/** Materiały: kalendarz lekcji z podpiętymi notatkami (domyślnie) albo przeglądanie po przedmiotach. */
export default function MaterialsPage({ initialSubjectId = null }: { initialSubjectId?: string | null }) {
  const [view, setView] = useState<'calendar' | 'subjects'>(initialSubjectId ? 'subjects' : 'calendar')
  const [subjectId, setSubjectId] = useState<string | null>(initialSubjectId)

  return (
    <div>
      <div className="bg-bg border-line mb-4 flex gap-1 rounded-xl border p-1" role="group" aria-label="Widok materiałów">
        {(
          [
            ['calendar', 'Kalendarz'],
            ['subjects', 'Przedmioty'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            aria-pressed={view === id}
            onClick={() => setView(id)}
            className="text-muted aria-pressed:bg-surface aria-pressed:text-text flex-1 rounded-lg px-3 py-1.5 text-sm font-medium aria-pressed:shadow-sm"
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'calendar' ? (
        <CalendarView
          onOpenSubject={(id) => {
            setSubjectId(id)
            setView('subjects')
          }}
        />
      ) : (
        <SubjectsView key={subjectId ?? 'none'} initialSubjectId={subjectId} />
      )}
    </div>
  )
}
