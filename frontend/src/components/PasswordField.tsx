import React, { useState } from 'react';
import { ListInput } from 'konsta/react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordFieldProps {
  label: string;
  placeholder?: string;
  value: string;
  autoComplete?: string;
  onChange: (value: string) => void;
}

// Password box with an eye button inside it: tap the eye to show or hide the password
export const PasswordField: React.FC<PasswordFieldProps> = ({
  label,
  placeholder,
  value,
  autoComplete,
  onChange,
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <ListInput
      outline
      className="relative"
      inputClassName="!pr-12"
      label={label}
      type={visible ? 'text' : 'password'}
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 text-slate-500 active:text-primary"
      >
        {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </ListInput>
  );
};
