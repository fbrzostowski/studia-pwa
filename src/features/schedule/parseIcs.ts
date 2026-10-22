import type { SubjectKind } from '../materials/types'

// Formy zajęć z USOS, które aplikacja potrafi zamienić na rodzaj przedmiotu.
const KNOWN_FORMS = ['WYK', 'LAB', 'KON', 'CW'] as const
type Form = (typeof KNOWN_FORMS)[number]

export interface IcsEvent {
  code: string // Sygnatura w USOS, np. 110491-D; puste, gdy brak
  name: string
  form: string
  group?: string
  room?: string
  start: string // czas lokalny, YYYY-MM-DDTHH:mm
}

export interface Candidate {
  key: string
  code: string
  name: string
  kind: SubjectKind
  forms: string[]
  count: number
  firstDate: string
  lastDate: string
}

export interface Skipped {
  name: string
  form: string
  count: number
}

// RFC 5545: długie linie są zawijane (kolejna linia zaczyna się spacją/tabem), a znaki specjalne mają escape.
const unfold = (text: string) => text.replace(/^﻿/, '').replace(/\r?\n[ \t]/g, '')
const unescapeText = (s: string) =>
  s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')

function prop(block: string, name: string) {
  const m = block.match(new RegExp(`^${name}(?:;[^:\\n]*)?:(.*)$`, 'm'))
  return m ? m[1].trim() : ''
}

// DTSTART w USOS to czas „pływający” (bez strefy): 20261006T080000
function toLocalIso(v: string) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : ''
}

export function parseIcs(text: string): IcsEvent[] {
  const blocks = [...unfold(text).matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map((m) => m[1])
  const events: IcsEvent[] = []

  for (const b of blocks) {
    const start = toLocalIso(prop(b, 'DTSTART'))
    const desc = unescapeText(prop(b, 'DESCRIPTION'))
    // Linie opisu mogą się różnić (np. brak „Sala:”), więc każde pole wyciągamy osobno.
    const field = (re: RegExp) => desc.match(re)?.[1].trim() ?? ''

    const form = field(/Forma:\s*([^,\n]+)/).toUpperCase()
    if (!start || !form) continue

    events.push({
      code: field(/^Sygnatura:\s*(.+)$/m),
      name: field(/^Nazwa:\s*(.+)$/m) || unescapeText(prop(b, 'SUMMARY')),
      form,
      group: field(/Grupa:\s*([^,\n]+)/) || undefined,
      room: field(/^Sala:\s*(.+)$/m) || undefined,
      start,
    })
  }
  return events
}

const isKnown = (f: string): f is Form => (KNOWN_FORMS as readonly string[]).includes(f)

// Wspólny rodzaj dla kilku form pod jedną sygnaturą; undefined = brak takiego rodzaju w aplikacji.
function combinedKind(forms: Set<Form>): SubjectKind | undefined {
  if (forms.size === 1) return [...forms][0]
  if (forms.size === 2 && forms.has('CW')) {
    if (forms.has('WYK')) return 'WYK+CW'
    if (forms.has('KON')) return 'KON+CW'
  }
  return undefined
}

/**
 * Grupuje terminy po sygnaturze: ten sam przedmiot z wykładem i ćwiczeniami
 * (osobne wpisy w USOS) daje jeden przedmiot WYK+CW. Kombinacje, których aplikacja
 * nie ma jako rodzaju, rozbijamy na osobne przedmioty per forma.
 */
export function toCandidates(events: IcsEvent[]): { candidates: Candidate[]; skipped: Skipped[] } {
  const groups = new Map<string, IcsEvent[]>()
  for (const e of events) {
    const k = e.code || e.name
    groups.set(k, [...(groups.get(k) ?? []), e])
  }

  const candidates: Candidate[] = []
  const skippedMap = new Map<string, Skipped>()

  for (const [key, evs] of groups) {
    const name = evs[0].name
    const code = evs[0].code

    for (const e of evs.filter((e) => !isKnown(e.form))) {
      const sk = skippedMap.get(`${key}|${e.form}`) ?? { name, form: e.form, count: 0 }
      sk.count++
      skippedMap.set(`${key}|${e.form}`, sk)
    }

    const known = evs.filter((e) => isKnown(e.form))
    if (known.length === 0) continue
    const forms = new Set(known.map((e) => e.form as Form))

    const make = (kind: SubjectKind, list: IcsEvent[], suffix = '') => {
      const dates = list.map((e) => e.start.slice(0, 10)).sort()
      candidates.push({
        key: key + suffix,
        code,
        name,
        kind,
        forms: [...new Set(list.map((e) => e.form))],
        count: list.length,
        firstDate: dates[0],
        lastDate: dates[dates.length - 1],
      })
    }

    const kind = combinedKind(forms)
    if (kind) make(kind, known)
    else for (const f of forms) make(f, known.filter((e) => e.form === f), `|${f}`)
  }

  candidates.sort((a, b) => a.name.localeCompare(b.name, 'pl'))
  return { candidates, skipped: [...skippedMap.values()] }
}
