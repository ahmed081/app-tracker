import { ArrowRight } from 'lucide-react';
import { useFormat } from '@/i18n/format';
import { cn } from './cn';

/**
 * "#24 → #6", laid out as a row so it reads correctly in both directions
 * (in Arabic: #6 ← #24, read right to left). Text arrows are not mirrored by
 * the browser, so the arrow is an icon flipped for right-to-left.
 */
export function RankTransition({ from, to, className }: { from: number | null | undefined; to: number | null | undefined; className?: string }) {
  const f = useFormat();
  return (
    <span className={cn('inline-flex items-center gap-1 tnum text-ink-2', className)}>
      <span>{f.rank(from)}</span>
      <ArrowRight aria-hidden className="size-3.5 text-ink-3 rtl:-scale-x-100" />
      <span className="font-semibold text-ink">{f.rank(to)}</span>
    </span>
  );
}
