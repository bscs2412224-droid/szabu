import React from 'react';
import { List, ListItem } from 'konsta/react';
import { CheckCircle2, Circle } from 'lucide-react';

import type { PasswordCriteria } from '../lib/password';

const RULES: { key: keyof PasswordCriteria; label: string }[] = [
  { key: 'hasMinLength', label: 'At least 8 characters' },
  { key: 'hasUpper', label: 'Upper-case letter (A-Z)' },
  { key: 'hasLower', label: 'Lower-case letter (a-z)' },
  { key: 'hasDigit', label: 'At least one digit (0-9)' },
  { key: 'hasSpecial', label: 'Special character (! @ # $ %)' },
  { key: 'passwordsMatch', label: 'Both passwords match' },
];

// Live checklist: each rule turns green as soon as it is satisfied
export const PasswordRules: React.FC<{ criteria: PasswordCriteria }> = ({ criteria }) => (
  <List strong inset dividers>
    {RULES.map((rule) => (
      <ListItem
        key={rule.key}
        title={<span className={criteria[rule.key] ? 'text-emerald-700' : ''}>{rule.label}</span>}
        after={
          criteria[rule.key] ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-label="done" />
          ) : (
            <Circle className="w-5 h-5 text-slate-400" aria-label="not done" />
          )
        }
      />
    ))}
  </List>
);
