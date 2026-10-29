import type { IcsEvent } from './parseIcs'

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Zawijanie linii wg RFC 5545: do 75 bajtów UTF-8, kolejne linie zaczynają się spacją; nie tnie znaków w środku. */
export function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  let limit = 75
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (bytes + n > limit) {
      out.push(cur)
      cur = ' '
      bytes = 1
      limit = 75
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n')
}

const stamp = (iso: string) => iso.replace(/[-:]/g, '') + '00' // 2026-10-29T09:50 → 20261029T095000

/**
 * Plan jako plik .ics w formacie z USOS (ten sam, który wczytuje aplikacja): czas „pływający” bez strefy
 * oraz opis „Nazwa / Sygnatura / Forma, Grupa / Sala / godziny”. Wynik da się edytować i wczytać z powrotem.
 */
export function toIcs(events: IcsEvent[], now = new Date()): string {
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LOM.SGH//plan//PL', 'CALSCALE:GREGORIAN']
  events.forEach((e, i) => {
    const desc = [
      `Nazwa: ${e.name}`,
      ...(e.code ? [`Sygnatura: ${e.code}`] : []),
      `Forma: ${e.form}, Grupa: ${e.group ?? ''}, `,
      ...(e.room ? [`Sala: ${e.room}`] : []),
      `${e.start.slice(11, 16)} - ${e.end.slice(11, 16)}`,
    ].join('\n')
    lines.push(
      'BEGIN:VEVENT',
      `UID:lom-${i}-${e.start.replace(/\D/g, '')}@lomiankowe-sgh.pl`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(e.end)}`,
      `SUMMARY:${esc(e.name)}`,
      `DESCRIPTION:${esc(desc)}`,
      'END:VEVENT',
    )
  })
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
