import React from 'react';
import { Block } from 'konsta/react';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';

interface FeedbackProps {
  error?: string | null;
  info?: string | null;
  /** A neutral heads-up (amber), for example that the session ended */
  notice?: string | null;
}

// Error / success message shown above a form
export const Feedback: React.FC<FeedbackProps> = ({ error, info, notice }) => (
  <>
    {notice && !error && (
      <Block strong inset className="!my-3 border border-amber-300 bg-amber-50 text-amber-950 text-sm flex items-start gap-2" role="status">
        <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <span>{notice}</span>
      </Block>
    )}
    {error && (
      <Block strong inset className="!my-3 border border-red-200 bg-red-50 text-red-700 text-sm flex items-start gap-2" role="alert">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <span>{error}</span>
      </Block>
    )}
    {info && !error && (
      <Block strong inset className="!my-3 border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm flex items-start gap-2">
        <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <span>{info}</span>
      </Block>
    )}
  </>
);
