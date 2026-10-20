import { useState } from 'react';
import { cn } from './cn';

const TINTS = ['#0d5c46', '#2a78d6', '#6250d6', '#b07a00', '#b42828', '#1b7f8f', '#7a4b9c', '#3d6b1f'];

function tintFor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return TINTS[Math.abs(h) % TINTS.length] ?? TINTS[0]!;
}

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

/** App icon with the App Store's rounded square, or initials when there is no icon. */
export function AppIcon({ name, url, seed, size = 40, className }: { name: string; url?: string | null; seed: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const radius = Math.round(size * 0.225);
  const style = { width: size, height: size, borderRadius: radius };
  if (url && !failed) {
    return <img src={url} alt="" width={size} height={size} style={style} loading="lazy" onError={() => setFailed(true)}
      className={cn('shrink-0 border border-line object-cover', className)} />;
  }
  return (
    <span aria-hidden style={{ ...style, background: tintFor(seed), fontSize: size * 0.36 }}
      className={cn('inline-flex shrink-0 items-center justify-center font-semibold text-white', className)}>
      {initials(name)}
    </span>
  );
}
