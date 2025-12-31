"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

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
  const supabase = getSupabaseClient();

  if (!isOpen) return null;

  const handleSubscribe = async () => {
    setLoading(true);

    try {
      // Check if user is logged in
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Redirect to sign in first
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback?next=${window.location.pathname}`,
          },
        });
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
        <h2 className="paywall-title">Upgrade to Unlimited</h2>
        <p className="paywall-description">
          You&apos;ve used all your free articles for today. Upgrade to get unlimited
          access to AI-generated articles, audio, quizzes, and more.
        </p>

        <p className="paywall-usage">
          {currentUsage} / {limit} free articles used today
        </p>

        <div className="paywall-price">$20</div>
        <p className="paywall-price-detail">per month · Cancel anytime</p>

        <button
          className="paywall-btn"
          onClick={handleSubscribe}
          disabled={loading}
        >
          {loading ? "Loading..." : "Get Unlimited Access"}
        </button>

        <button className="paywall-close" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}

