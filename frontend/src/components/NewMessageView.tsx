import React, { useCallback, useEffect, useState } from 'react';
import { Block, List, ListItem, Navbar, NavbarBackLink, Page, Preloader, Searchbar } from 'konsta/react';
import { getContactsSaved, openConversation } from '../api/messages';
import type { ApiError, Contact } from '../api/messages';
import { initialsOf, roleLabel } from '../lib/roles';
import type { OpenChat } from './MessagesTab';

interface NewMessageViewProps {
  onBack: () => void;
  onOpenChat: (chat: OpenChat) => void;
}

// Pick someone to message. The server lists only the people this user is allowed to message (REQ-5.1).
export const NewMessageView: React.FC<NewMessageViewProps> = ({ onBack, onOpenChat }) => {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    try {
      setContacts((await getContactsSaved()).data);
      setError(null);
    } catch {
      setError('Contacts could not be loaded. Tap to retry.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open: state is only set after the request returns
    void load();
  }, [load]);

  const choose = async (c: Contact) => {
    if (opening) return;
    setOpening(true);
    setError(null);
    try {
      const chat = await openConversation(c.id);
      onOpenChat({ id: chat.id, name: c.name, role: c.role });
    } catch (e) {
      setError((e as ApiError).message || 'Could not open the conversation.');
      setOpening(false);
    }
  };

  const needle = query.trim().toLowerCase();
  const shown = (contacts ?? []).filter(
    (c) => !needle || c.name.toLowerCase().includes(needle) || roleLabel(c.role).toLowerCase().includes(needle),
  );

  return (
    <Page>
      <Navbar title="New message" left={<NavbarBackLink text="Chats" onClick={onBack} />} />

      <Searchbar
        placeholder="Search by name or role"
        value={query}
        onInput={(e) => setQuery(e.target.value)}
        onClear={() => setQuery('')}
        disableButton={false}
        clearButton
      />

      {error && (
        <Block strong inset className="border border-red-200 bg-red-50 text-red-700 text-sm" onClick={() => void load()}>
          {error}
        </Block>
      )}

      {!error && contacts === null && (
        <div className="flex justify-center py-8">
          <Preloader />
        </div>
      )}

      {contacts !== null && contacts.length === 0 && (
        <Block strong inset className="text-center text-sm text-slate-600">
          There is nobody you can message yet.
        </Block>
      )}

      {contacts !== null && contacts.length > 0 && shown.length === 0 && (
        <Block strong inset className="text-center text-sm text-slate-600">
          No matching contacts found.
        </Block>
      )}

      {shown.length > 0 && (
        <List strong inset dividers>
          {shown.map((c) => (
            <ListItem
              key={c.id}
              link
              chevronMaterial={false}
              onClick={() => void choose(c)}
              media={
                <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                  {initialsOf(c.name)}
                </div>
              }
              title={c.name}
              subtitle={roleLabel(c.role)}
              text={c.group}
            />
          ))}
        </List>
      )}
      <div className="h-6" />
    </Page>
  );
};
