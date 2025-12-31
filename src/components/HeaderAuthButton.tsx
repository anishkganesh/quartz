"use client";

import { useState, useEffect } from "react";
import { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { LogOut } from "lucide-react";

export default function HeaderAuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSignIn = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setShowMenu(false);
  };

  // Get user's display name from metadata or email
  const getUserName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    if (user?.user_metadata?.name) {
      return user.user_metadata.name;
    }
    // Extract name from email (before @)
    if (user?.email) {
      const namePart = user.email.split("@")[0];
      return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }
    return "User";
  };

  // Get user's initial
  const getUserInitial = () => {
    const name = getUserName();
    return name.charAt(0).toUpperCase();
  };

  if (loading) {
    return null;
  }

  if (user) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="avatar-btn"
          aria-label="User menu"
        >
          <span className="avatar-initial">{getUserInitial()}</span>
        </button>
        
        {/* Backdrop - only when menu is open */}
        {showMenu && (
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowMenu(false)}
          />
        )}
        
        {/* Dropdown - always rendered, visibility controlled by CSS class */}
        <div className={`avatar-dropdown ${showMenu ? "show" : ""}`}>
          <div className="avatar-dropdown-row">
            <div className="avatar-dropdown-avatar">
              <span>{getUserInitial()}</span>
            </div>
            <div className="avatar-dropdown-info">
              <span className="avatar-dropdown-name">{getUserName()}</span>
              <span className="avatar-dropdown-email">{user.email}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="avatar-dropdown-logout"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button onClick={handleSignIn} className="header-auth-btn">
      Login
    </button>
  );
}

