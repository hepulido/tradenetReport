import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  auth,
  onAuthStateChanged,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  logOut,
  getIdToken,
  type FirebaseUser,
} from "@/lib/firebase";
import type { User, Company, UserCompany } from "@shared/schema";

interface AuthUser extends User {
  firebaseUser: FirebaseUser;
  companies: Array<UserCompany & { company: Company }>;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, companyName: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync Firebase user with our backend
  const syncUserWithBackend = async (firebaseUser: FirebaseUser): Promise<AuthUser | null> => {
    try {
      const token = await firebaseUser.getIdToken();
      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoUrl: firebaseUser.photoURL,
        }),
      });

      if (!response.ok) {
        console.error("Failed to sync user with backend");
        return null;
      }

      const data = await response.json();
      return {
        ...data.user,
        firebaseUser,
        companies: data.companies || [],
      };
    } catch (error) {
      console.error("Error syncing user:", error);
      return null;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const syncedUser = await syncUserWithBackend(firebaseUser);
        setUser(syncedUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const firebaseUser = await signInWithEmail(email, password);
    const syncedUser = await syncUserWithBackend(firebaseUser);
    setUser(syncedUser);
  };

  const signUp = async (email: string, password: string, displayName: string, companyName: string) => {
    const firebaseUser = await signUpWithEmail(email, password, displayName);
    const token = await firebaseUser.getIdToken();

    // Create user and company in our backend
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName,
        companyName,
      }),
    });

    if (!response.ok) {
      // If backend fails, delete the Firebase user
      await firebaseUser.delete();
      throw new Error("Failed to create account");
    }

    const data = await response.json();
    setUser({
      ...data.user,
      firebaseUser,
      companies: data.companies || [],
    });
  };

  const signInGoogle = async () => {
    const firebaseUser = await signInWithGoogle();
    const syncedUser = await syncUserWithBackend(firebaseUser);

    // If user doesn't have a company yet, they need to create one
    if (syncedUser && syncedUser.companies.length === 0) {
      // We'll handle this in the UI by showing a "create company" flow
    }

    setUser(syncedUser);
  };

  const handleSignOut = async () => {
    await logOut();
    setUser(null);
  };

  const getToken = async () => {
    return getIdToken();
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
      const syncedUser = await syncUserWithBackend(auth.currentUser);
      setUser(syncedUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signInGoogle,
        signOut: handleSignOut,
        getToken,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
