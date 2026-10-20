import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './cn';

interface ComboboxOption<T extends string> {
  value: T;
  label: string;
  /** Extra text that also matches when typing (e.g. the English name or the ID). */
  keywords?: string;
}

interface ComboboxProps<T extends string> {
  label: string;
  /** Show the label visually above the control (otherwise screen readers only). */
  showLabel?: boolean;
  value: T;
  options: readonly ComboboxOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  /** Shown when nothing matches what was typed. */
  noMatch: string;
  className?: string;
}

/** Lower case, without accents, so "casi" finds "Casino" and "cafe" finds "Café". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** Options whose label or keywords contain every typed word, labels starting with the text first. */
export function filterOptions<T extends string>(options: readonly ComboboxOption<T>[], query: string): ComboboxOption<T>[] {
  const q = normalize(query);
  if (!q) return [...options];
  const words = q.split(/\s+/);
  return options
    .map((o) => ({ o, label: normalize(o.label), all: normalize(`${o.label} ${o.keywords ?? ''}`) }))
    .filter(({ all }) => words.every((w) => all.includes(w)))
    .sort((a, b) => Number(b.label.startsWith(q)) - Number(a.label.startsWith(q)))
    .map(({ o }) => o);
}

/**
 * A select you can type into: the list narrows as you type (autocomplete).
 * Arrow keys move, Enter picks, Escape closes and restores the current value.
 */
export function Combobox<T extends string>({ label, showLabel, value, options, onChange, placeholder, noMatch, className }: ComboboxProps<T>) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const matches = useMemo(() => filterOptions(options, query), [options, query]);

  // Close when clicking or tabbing outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, id]);

  function openList() {
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery('');
  }

  function pick(option: ComboboxOption<T> | undefined) {
    if (!option) return;
    close();
    if (option.value !== value) onChange(option.value);
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (matches.length ? (i + step + matches.length) % matches.length : 0));
    } else if (e.key === 'Enter') {
      if (open) {
        e.preventDefault();
        pick(matches[active]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        close();
      }
    } else if (e.key === 'Tab') {
      close();
    }
  };

  return (
    <div ref={rootRef} className={cn('relative flex flex-col gap-1', className)}>
      <label htmlFor={id} className={showLabel ? 'text-[12px] text-ink-3' : 'sr-only'}>{label}</label>
      <div className="relative">
        <input ref={inputRef} id={id} type="text" role="combobox" autoComplete="off" spellCheck={false}
          aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && matches.length ? `${id}-opt-${active}` : undefined}
          value={open ? query : selected?.label ?? ''} placeholder={open ? selected?.label ?? placeholder : placeholder}
          onFocus={(e) => { if (!open) { openList(); e.target.select(); } }}
          onClick={() => { if (!open) openList(); }}
          onChange={(e) => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
          onKeyDown={onKeyDown}
          className="w-full rounded-lg border border-line bg-surface py-1.5 pe-8 ps-3 text-[13px] font-medium text-ink placeholder:font-normal placeholder:text-ink-3 hover:border-line-strong" />
        <ChevronDown aria-hidden className={cn('pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3 transition-transform', open && 'rotate-180')} />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={label}
          className="absolute top-full z-30 mt-1 max-h-72 w-full min-w-[14rem] overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg">
          {matches.length === 0 && <li className="px-3 py-2 text-[13px] text-ink-3">{noMatch}</li>}
          {matches.map((o, i) => (
            <li key={o.value} id={`${id}-opt-${i}`} role="option" aria-selected={o.value === value}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px]',
                i === active ? 'bg-surface-2 text-ink' : 'text-ink-2', o.value === value && 'font-medium text-felt')}>
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === value && <Check aria-hidden className="size-3.5 shrink-0" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
