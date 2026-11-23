import React from 'react';
import { Block } from 'konsta/react';
import { ShieldAlert } from 'lucide-react';

// Shown instead of the content when the account is not placed in the SZABIST hierarchy yet (REQ-2.5)
export const BlockedNotice: React.FC<{ section: string }> = ({ section }) => (
  <Block strong inset className="!mt-6 border border-amber-300 bg-amber-50 text-amber-950" role="alert">
    <div className="flex items-start gap-3">
      <ShieldAlert className="w-6 h-6 text-amber-700 flex-shrink-0 mt-0.5" />
      <div>
        <h2 className="font-bold text-base">{section} is not available yet</h2>
        <p className="text-sm mt-1">
          Your account has not been placed in the SZABIST hierarchy, so this section is blocked. Please contact{' '}
          <a href="mailto:admin@szabist.edu.pk" className="font-semibold text-primary underline">
            admin@szabist.edu.pk
          </a>{' '}
          to have your position assigned.
        </p>
      </div>
    </div>
  </Block>
);
