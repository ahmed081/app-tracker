import { describe, expect, it } from 'vitest';
import { filterOptions } from './Combobox';

describe('category autocomplete', () => {
  const options = [
    { value: '7004', label: 'Board', keywords: 'Board 7004' },
    { value: '7006', label: 'Casino', keywords: 'Casino 7006' },
    { value: '7003', label: 'Casual', keywords: 'Casual 7003' },
    { value: '6023', label: 'Food & Drink', keywords: 'Food & Drink 6023' },
    { value: '7005', label: 'ألعاب الورق', keywords: 'Card 7005' },
  ];
  const values = (q: string) => filterOptions(options, q).map((o) => o.value);

  it('narrows the list as you type, ignoring case and accents', () => {
    expect(values('cas')).toEqual(['7006', '7003']);
    expect(values('CASÍ')).toEqual(['7006']);
    expect(values('drink')).toEqual(['6023']);
    expect(values('')).toHaveLength(5);
    expect(values('zzz')).toEqual([]);
  });

  it('also matches the English name and the ID, and puts labels starting with the text first', () => {
    expect(values('card')).toEqual(['7005']);         // translated label, English keyword
    expect(values('7006')).toEqual(['7006']);
    expect(values('ca')).toEqual(['7006', '7003', '7005']);   // labels starting with "ca" before the keyword match
  });
});
