import React, { useEffect, useState } from 'react';
import { BadgeCheck, GraduationCap, Layers, Mail, MessageSquare, ShieldAlert, Sparkles, UserRound, X } from 'lucide-react';
import { Preloader } from 'konsta/react';
import { getContactsSaved, openConversation } from '../api/messages';
import type { ApiError, Contact } from '../api/messages';
import type { DirectoryContact } from '../data/directory';
import { Pill } from './Pill';
import type { OpenChat } from './MessagesTab';

const CATEGORY_LABEL: Record<DirectoryContact['category'], string> = {
  Leadership: 'Leadership',
  'Program Managers': 'Program Manager',
  Faculty: 'Faculty',
  Student: 'Student',
};

const CATEGORY_TONE = { Leadership: 'indigo', 'Program Managers': 'teal', Faculty: 'blue', Student: 'amber' } as const;

interface ContactCardProps {
  person: DirectoryContact;
  /** false for the administrator and for people not yet placed: no Message button at all */
  messagingOn: boolean;
  onClose: () => void;
  onOpenChat: (chat: OpenChat) => void;
}

// One row of the card: icon, small label, value
const Row: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex items-start gap-3 py-3">
    <span className="mt-0.5 w-8 h-8 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">{icon}</span>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-[15px] font-semibold text-slate-900 leading-snug break-words">{children}</p>
    </div>
  </div>
);

/**
 * The profile card that opens when someone is tapped in the Directory.
 * The directory itself is read-only. The Message button appears when the server lists this person as someone
 * who can be messaged (everyone in the directory who has an account row), so it never offers a refused chat.
 */
export const ContactCard: React.FC<ContactCardProps> = ({ person, messagingOn, onClose, onOpenChat }) => {
  // checking: asking the server who may be messaged · allowed: a matching contact · none: not allowed
  const [match, setMatch] = useState<Contact | null | 'checking'>(messagingOn ? 'checking' : null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!messagingOn) return;
    let cancelled = false;
    getContactsSaved()
      .then(({ data }) => {
        if (!cancelled) setMatch(data.find((c) => c.name.trim().toLowerCase() === person.name.trim().toLowerCase()) ?? null);
      })
      .catch(() => {
        if (!cancelled) setMatch(null);
      });
    return () => {
      cancelled = true;
    };
  }, [messagingOn, person.name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const message = async () => {
    if (!match || match === 'checking' || opening) return;
    setOpening(true);
    setError(null);
    try {
      const chat = await openConversation(match.id);
      onOpenChat({ id: chat.id, name: match.name, role: match.role });
    } catch (e) {
      setError((e as ApiError).message || 'Could not open the conversation.');
      setOpening(false);
    }
  };

  // "Assistant Professor / Head of Computer Science" -> designation + position
  const [designation, ...rest] = person.role.split(' / ');
  const position = rest.join(' / ');
  const first = person.name.replace(/^((Prof|Dr|Mr|Ms|Sir|Engr)\.?\s+)+/i, '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 szabu-fade"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${person.name}, profile`}
        onClick={(e) => e.stopPropagation()}
        className="szabu-sheet w-full max-w-md max-h-[92%] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl"
      >
        <div className="bg-primary text-white px-5 pt-6 pb-5 rounded-t-3xl relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 flex items-center justify-center active:bg-white/30"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-4 pr-10">
            <div className="w-[72px] h-[72px] shrink-0 rounded-2xl bg-white text-primary flex items-center justify-center text-2xl font-extrabold shadow">
              {person.initials}
            </div>
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                <BadgeCheck className="w-3 h-3" /> Official SzabU member
              </span>
              <h2 className="mt-1.5 text-xl font-bold leading-tight break-words">{person.name}</h2>
            </div>
          </div>
        </div>

        <div className="px-5 pt-3 pb-5">
          <div className="pb-1">
            <Pill tone={CATEGORY_TONE[person.category]}>{CATEGORY_LABEL[person.category]}</Pill>
          </div>

          <div className="divide-y divide-slate-100">
            <Row icon={<UserRound className="w-4 h-4" />} label="Designation">
              {designation}
            </Row>
            {position && (
              <Row icon={<Layers className="w-4 h-4" />} label="Position">
                {position}
              </Row>
            )}
            {person.email && (
              <Row icon={<Mail className="w-4 h-4" />} label="Campus email">
                {person.email}
              </Row>
            )}
            {person.qualification && (
              <Row icon={<GraduationCap className="w-4 h-4" />} label="Qualification">
                {person.qualification}
              </Row>
            )}
            {person.field && (
              <Row icon={<Sparkles className="w-4 h-4" />} label="Field">
                {person.field}
              </Row>
            )}
          </div>

          <p className="mt-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-600">
            Phone numbers are private and are never shown in the app.
          </p>

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700 font-medium">
              {error}
            </p>
          )}

          {messagingOn && (
            <div className="mt-4">
              {match === 'checking' && (
                <div className="flex justify-center py-3">
                  <Preloader />
                </div>
              )}
              {match && match !== 'checking' && (
                <button
                  type="button"
                  onClick={message}
                  disabled={opening}
                  className="w-full h-12 rounded-xl bg-primary text-white font-semibold flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-60"
                >
                  <MessageSquare className="w-5 h-5" />
                  {opening ? 'Opening…' : `Message ${first.split(' ')[0]}`}
                </button>
              )}
              {match === null && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-900">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-px" />
                  This person has not been added to SzabU yet, so they cannot be messaged.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
