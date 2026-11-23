import React, { useEffect, useState } from 'react';
import { Button } from 'konsta/react';
import { UPDATE_READY_EVENT, applyUpdate } from '../lib/pwa';

// "A new version is ready". The user chooses when to reload, so a message being typed is never lost.
export const UpdateBanner: React.FC = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const show = () => setReady(true);
    window.addEventListener(UPDATE_READY_EVENT, show);
    return () => window.removeEventListener(UPDATE_READY_EVENT, show);
  }, []);

  if (!ready) return null;

  return (
    <div
      role="status"
      className="absolute left-3 right-3 bottom-20 z-50 rounded-2xl bg-slate-900 text-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg"
    >
      <span className="text-sm">A new version of SzabU is ready.</span>
      <Button small rounded inline onClick={() => void applyUpdate()}>
        Update
      </Button>
    </div>
  );
};
