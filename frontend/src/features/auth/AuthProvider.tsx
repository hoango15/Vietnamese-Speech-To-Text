import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../shared/api/client";
import type { Session, User } from "../../shared/types";

export const AuthContext = createContext<{
  user: User | null;
  update: (user: User) => void;
  sessionEnded: boolean;
}>({ user: null, update: () => {}, sessionEnded: false });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({
  children,
}: {
  children: (ready: boolean) => ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [sessionEnded, setSessionEnded] = useState(false),
    [ready, setReady] = useState(false);
  const hadSession = useRef(false);
  useEffect(() => {
    api.onSession = (value) => {
      if (value) setSessionEnded(false);
      else if (hadSession.current) setSessionEnded(true);
      hadSession.current = Boolean(value);
      setSession(value);
    };
    api
      .refresh()
      .catch(() => {})
      .finally(() => setReady(true));
    return () => {
      api.onSession = () => {};
    };
  }, []);
  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        sessionEnded,
        update: (user) => setSession((old) => (old ? { ...old, user } : null)),
      }}
    >
      {children(ready)}
    </AuthContext.Provider>
  );
}
