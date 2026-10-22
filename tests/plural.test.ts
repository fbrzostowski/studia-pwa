import { expect, it } from 'vitest'
import { plural } from '../src/lib/plural'

it('odmienia liczebniki po polsku', () => {
  const f = (n: number) => plural(n, 'osoba', 'osoby', 'osób')
  expect([0, 1, 2, 4, 5, 11, 12, 14, 15, 22, 24, 25, 112].map(f)).toEqual([
    'osób', 'osoba', 'osoby', 'osoby', 'osób', 'osób', 'osób', 'osób', 'osób', 'osoby', 'osoby', 'osób', 'osób',
  ])
})
