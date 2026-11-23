import React, { useState } from 'react';
import { Block, BlockTitle, List, ListItem, Searchbar } from 'konsta/react';
import type { User } from '../api/auth';
import { DIRECTORY_DATA } from '../data/directory';
import type { DirectoryContact } from '../data/directory';
import { BlockedNotice } from './BlockedNotice';
import { ContactCard } from './ContactCard';
import type { OpenChat } from './MessagesTab';

const GROUPS: { category: DirectoryContact['category']; title: string }[] = [
  { category: 'Leadership', title: 'Leadership' },
  { category: 'Program Managers', title: 'Program Managers' },
  { category: 'Faculty', title: 'Faculty' },
  { category: 'Student', title: 'Students' },
];

// Read-only list. Tap a person to see their profile card (and message them, when the hierarchy allows it)
export const DirectoryTab: React.FC<{ user: User; onOpenChat: (chat: OpenChat) => void }> = ({ user, onOpenChat }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<DirectoryContact | null>(null);
  const messagingOn = user.role !== 'ADMIN' && user.isPlacedInHierarchy && !user.messagingBlocked;

  if (!user.isPlacedInHierarchy) return <BlockedNotice section="Campus directory" />;

  const matches = DIRECTORY_DATA.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <Searchbar
        placeholder="Search by name"
        value={query}
        onInput={(e) => setQuery(e.target.value)}
        onClear={() => setQuery('')}
        disableButton={false}
        clearButton
      />

      {matches.length === 0 && (
        <Block strong inset className="text-center text-sm text-slate-600">
          No contacts match &ldquo;{query}&rdquo;.
        </Block>
      )}

      {GROUPS.map(({ category, title }) => {
        const people = matches.filter((c) => c.category === category);
        if (people.length === 0) return null;
        return (
          <React.Fragment key={category}>
            <BlockTitle>
              {title} ({people.length})
            </BlockTitle>
            <List strong inset dividers>
              {people.map((c) => (
                <ListItem
                  key={c.id}
                  media={
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                      {c.initials}
                    </div>
                  }
                  title={c.name}
                  subtitle={c.role}
                  text={[c.qualification, c.field].filter(Boolean).join(' · ')}
                  link
                  chevron
                  onClick={() => setSelected(c)}
                />
              ))}
            </List>
          </React.Fragment>
        );
      })}
      <div className="h-6" />
      {selected && (
        <ContactCard person={selected} messagingOn={messagingOn} onClose={() => setSelected(null)} onOpenChat={onOpenChat} />
      )}
    </>
  );
};
