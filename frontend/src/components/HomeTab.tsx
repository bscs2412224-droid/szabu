import React from 'react';
import { Block, BlockTitle, List, ListItem } from 'konsta/react';
import { BookOpen, Calendar } from 'lucide-react';
import type { User } from '../api/auth';
import { BlockedNotice } from './BlockedNotice';
import { NotificationsBlock } from './NotificationsBlock';
import { Pill } from './Pill';
import { ROLE_LABELS } from '../lib/roles';

type Tone = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'sky' | 'teal' | 'indigo' | 'slate';

// Each course / milestone gets its own colour so the list is easy to scan
const TILE_STYLES: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  violet: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
  sky: 'bg-sky-100 text-sky-700',
};

const COURSES: { code: string; name: string; room: string; tone: Tone }[] = [
  { code: 'CSC-411', name: 'Final Year Project I (FYP-I)', room: 'Lab 3', tone: 'blue' },
  { code: 'CSC-382', name: 'Software Quality Assurance', room: 'Room 204', tone: 'emerald' },
  { code: 'CSC-420', name: 'Cloud Computing & Distributed Systems', room: 'Lab 1', tone: 'violet' },
  { code: 'MGT-201', name: 'Professional Ethics in Computing', room: 'Hall B', tone: 'amber' },
];

const MILESTONES: { title: string; date: string; status: string; tone: Tone }[] = [
  { title: 'FYP-I SRS Submission & Defense', date: 'November 15, 2026', status: 'Upcoming', tone: 'rose' },
  { title: 'Mid-Term Examinations', date: 'November 22, 2026', status: 'Scheduled', tone: 'violet' },
  { title: 'Semester Project Prototype Review', date: 'December 10, 2026', status: 'Scheduled', tone: 'sky' },
];

const ROLE_TONES: Record<string, Tone> = {
  STUDENT: 'blue',
  FACULTY: 'emerald',
  PM: 'violet',
  HOD: 'indigo',
  DEAN: 'amber',
  ADMIN: 'rose',
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

const IconTile: React.FC<{ tone: string; children: React.ReactNode }> = ({ tone, children }) => (
  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${TILE_STYLES[tone] ?? TILE_STYLES.blue}`}>
    {children}
  </div>
);

export const HomeTab: React.FC<{ user: User }> = ({ user }) => {
  const placed = user.isPlacedInHierarchy;
  const isAdmin = user.role === 'ADMIN';

  return (
    <>
      {/* Profile */}
      <Block strong inset className="!mt-4 flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center text-base font-bold flex-shrink-0">
          {initialsOf(user.fullName)}
        </div>
        <div className="min-w-0 space-y-1.5">
          <div>
            <h2 className="text-lg font-bold leading-snug">{user.fullName}</h2>
            <p className="text-xs text-slate-600 break-words">
              ID {user.szabistId} &middot; {user.email}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={ROLE_TONES[user.role] ?? 'blue'} uppercase>
              {ROLE_LABELS[user.role] ?? user.role}
            </Pill>
            {placed ? (
              <Pill tone="teal" uppercase>
                Fall 2026
              </Pill>
            ) : (
              <Pill tone="amber" uppercase>
                Unassigned
              </Pill>
            )}
          </div>
        </div>
      </Block>

      {!placed && <BlockedNotice section="Academic overview" />}

      {placed && !isAdmin && (
        <>
          <NotificationsBlock />

          <BlockTitle>Enrolled courses</BlockTitle>
          <List strong inset dividers>
            {COURSES.map((c) => (
              <ListItem
                key={c.code}
                media={
                  <IconTile tone={c.tone}>
                    <BookOpen className="w-5 h-5" />
                  </IconTile>
                }
                title={c.name}
                subtitle={
                  <span className="flex items-center gap-2 mt-0.5">
                    <Pill tone={c.tone} size="sm">
                      {c.code}
                    </Pill>
                    <span className="text-xs text-slate-500">{c.room}</span>
                  </span>
                }
                after={
                  <Pill tone="slate" size="sm">
                    3 credits
                  </Pill>
                }
              />
            ))}
          </List>

          <BlockTitle>Academic milestones</BlockTitle>
          <List strong inset dividers>
            {MILESTONES.map((m) => (
              <ListItem
                key={m.title}
                media={
                  <IconTile tone={m.tone}>
                    <Calendar className="w-5 h-5" />
                  </IconTile>
                }
                title={m.title}
                subtitle={m.date}
                after={
                  <Pill tone={m.tone} size="sm">
                    {m.status}
                  </Pill>
                }
              />
            ))}
          </List>
        </>
      )}
      <div className="h-6" />
    </>
  );
};
