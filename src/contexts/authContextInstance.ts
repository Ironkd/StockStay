import { createContext } from "react";
import type { AuthUser } from "../services/authApi";

export interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => void;
  refreshUser: () => Promise<void>;
  switchTeam: (teamId: string) => Promise<void>;
  isAuthenticated: boolean;
  loading: boolean;
  /** False for teamRole viewer (NFR-4); owners/members can write. */
  canWrite: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
