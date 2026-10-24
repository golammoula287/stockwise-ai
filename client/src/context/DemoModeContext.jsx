import { createContext, useContext } from 'react';

export const DemoModeContext = createContext(true);
export const useDemoMode = () => useContext(DemoModeContext);
