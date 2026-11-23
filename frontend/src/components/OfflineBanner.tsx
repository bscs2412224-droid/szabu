import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnline } from '../lib/useOnline';

// Shown only while the phone has no connection (PWA: the app keeps working offline)
export const OfflineBanner: React.FC = () => {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      className="mx-4 mt-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-xs px-3 py-2 flex items-start gap-2"
    >
      <WifiOff className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>You are offline. You can read saved messages. Messages you write are kept and sent when you are back online.</span>
    </div>
  );
};
