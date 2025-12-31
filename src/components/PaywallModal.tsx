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
}: PaywallModalProps) {
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  if (!isOpen) return null;

  const isAnonymous = !user;

  const handleSignIn = async () => {
    if (!supabase) return;
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
        // Store subscribe intent and return URL in localStorage before OAuth redirect
        localStorage.setItem("quartz_subscribe_intent", "true");
        localStorage.setItem("quartz_return_url", window.location.pathname);
        if (!supabase) return;
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        return;
      }

      // Create Stripe checkout session with return URL
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          returnUrl: window.location.pathname,
        }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Checkout response:", data);
        throw new Error(data.error || "Failed to create checkout session");
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
            ? `You've used your free article. Sign in for ${LIMITS.loggedIn} free articles per day, or subscribe for unlimited access.`
            : "You've reached your daily limit. Subscribe for unlimited access."
          }
        </p>

        <div className="paywall-buttons">
          {isAnonymous ? (
            <>
              <button
                className="pill-btn paywall-pill-btn"
                onClick={handleSignIn}
                disabled={loading}
              >
                {loading ? "..." : "Sign in"}
              </button>
              <button
                className="pill-btn paywall-pill-btn secondary"
                onClick={handleSubscribe}
                disabled={loading}
              >
                Subscribe · $20/mo
              </button>
            </>
          ) : (
            <button
              className="pill-btn paywall-pill-btn"
              onClick={handleSubscribe}
              disabled={loading}
            >
              {loading ? "..." : "Subscribe · $20/mo"}
            </button>
          )}
        </div>

        <button className="paywall-close" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}

