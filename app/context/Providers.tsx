'use client';

import { GlobalProvider } from './GlobalContext';
import { ReactNode } from 'react';

interface ProvidersProps {
  children: ReactNode;
}

export const Providers = ({ children }: ProvidersProps) => {
  return (
    <GlobalProvider>
      {children}
    </GlobalProvider>
  );
}