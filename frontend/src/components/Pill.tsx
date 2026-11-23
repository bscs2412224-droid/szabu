import React from 'react';

const TONES = {
  blue: 'bg-blue-100 text-blue-900',
  sky: 'bg-sky-100 text-sky-900',
  teal: 'bg-teal-100 text-teal-900',
  emerald: 'bg-emerald-100 text-emerald-900',
  amber: 'bg-amber-100 text-amber-900',
  rose: 'bg-rose-100 text-rose-900',
  violet: 'bg-violet-100 text-violet-900',
  indigo: 'bg-indigo-100 text-indigo-900',
  slate: 'bg-slate-200 text-slate-800',
} as const;

interface PillProps {
  tone?: keyof typeof TONES;
  /** Big pill (like the role tag on the profile card) or small pill (like a credit count) */
  size?: 'md' | 'sm';
  uppercase?: boolean;
  children: React.ReactNode;
}

// Rounded colour tag: soft tinted background with bold dark text
export const Pill: React.FC<PillProps> = ({ tone = 'blue', size = 'md', uppercase = false, children }) => (
  <span
    className={`inline-flex items-center rounded-full font-semibold whitespace-nowrap ${TONES[tone]} ${
      size === 'md' ? 'px-3.5 py-1 text-xs' : 'px-2.5 py-0.5 text-[11px]'
    } ${uppercase ? 'uppercase tracking-wide' : ''}`}
  >
    {children}
  </span>
);
