"use client";

import { useState, useEffect } from "react";
import { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { LIMITS } from "@/lib/client-usage";

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsage: number;
  limit: number;
}

export default function PaywallModal({
  isOpen,
  onClose,
  currentUsage,
  limit,
}: PaywallModalProps) {
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const supabase = getSupabaseClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  if (!isOpen) return null;

  const isAnonymous = !user;

  const handleSignIn = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${window.location.pathname}`,
      },
    });
  };

  const handleSubscribe = async () => {
    setLoading(true);

    try {
      if (!user) {
        await handleSignIn();
        return;
      }

      // Create Stripe checkout session
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
        }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("Failed to create checkout session");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="paywall-overlay" onClick={onClose}>
      <div className="paywall-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="paywall-title">
          {isAnonymous ? "Sign in to continue" : "Upgrade to Unlimited"}
        </h2>
        
        <p className="paywall-description">
          {isAnonymous 
            ? `You've used your ${LIMITS.anonymous} free articles. Sign in for ${LIMITS.loggedIn} free articles per day, or subscribe for unlimited access.`
            : "You've reached your daily limit. Subscribe for unlimited access to all features."
          }
        </p>

        <p className="paywall-usage">
          {currentUsage} / {limit} articles today
        </p>

        {isAnonymous ? (
          <>
            <button
              className="paywall-btn"
              onClick={handleSignIn}
              disabled={loading}
            >
              {loading ? "..." : "Sign in with Google"}
            </button>
            <p className="paywall-or">or</p>
            <button
              className="paywall-btn-secondary"
              onClick={handleSubscribe}
              disabled={loading}
            >
              Subscribe · $20/mo
            </button>
          </>
        ) : (
          <>
            <button
              className="paywall-btn"
              onClick={handleSubscribe}
              disabled={loading}
            >
              {loading ? "..." : "Subscribe · $20/mo"}
            </button>
          </>
        )}

        <button className="paywall-close" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}

