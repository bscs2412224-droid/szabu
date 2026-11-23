import React from 'react';

interface BrandHeaderProps {
  title?: string;
  subtitle?: string;
}

// Blue banner with the SZABIST logo, shown at the top of the logged-out screens
export const BrandHeader: React.FC<BrandHeaderProps> = ({
  title = 'SzabU',
  subtitle = 'Official academic messaging for SZABIST students and faculty',
}) => (
  <div className="bg-primary text-white px-6 pt-14 pb-10 text-center safe-area-top">
    <div className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 mb-4">
      <img src="/logo.png" alt="SZABIST SzabU" className="h-14 w-auto" />
    </div>
    <h1 className="text-2xl font-bold">{title}</h1>
    <p className="text-sm text-white/85 mt-1 max-w-xs mx-auto">{subtitle}</p>
  </div>
);
