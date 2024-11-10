'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface GlobalContextType {
  intent: string;
  setIntent: (intent: string) => void;
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export const GlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [intent, setIntent] = useState<string>('');

  return (
    <GlobalContext.Provider value={{ intent, setIntent }}>
      {children}
    </GlobalContext.Provider>
  );
};

export const useGlobalContext = (): GlobalContextType => {
  const context = useContext(GlobalContext);
  if (!context) {
    throw new Error('useGlobal must be used within a GlobalProvider');
  }
  return context;
};