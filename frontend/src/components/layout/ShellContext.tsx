"use client";

import { createContext, useContext } from "react";

type ShellContextValue = {
  openPalette: () => void;
  openUpload: () => void;
  closeNav: () => void;
};

export const ShellContext = createContext<ShellContextValue>({
  openPalette: () => {},
  openUpload: () => {},
  closeNav: () => {},
});

export function useShell() {
  return useContext(ShellContext);
}
