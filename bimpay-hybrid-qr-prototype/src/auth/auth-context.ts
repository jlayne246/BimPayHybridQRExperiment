import { createContext } from "react";

export interface AuthContextValue {
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
