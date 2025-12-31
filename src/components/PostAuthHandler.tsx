"use client";

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export default function PostAuthHandler() {
  useEffect(() => {
    const handlePostAuth = async () => {
      const subscribeIntent = localStorage.getItem("quartz_subscribe_intent");
      const returnUrl = localStorage.getItem("quartz_return_url");
      console.log("[PostAuthHandler] intent:", subscribeIntent, "returnUrl:", returnUrl);

      // Clear localStorage immediately to prevent loops
      localStorage.removeItem("quartz_subscribe_intent");
      localStorage.removeItem("quartz_return_url");

      // If no return URL stored, nothing to do
      if (!returnUrl) return;

      const supabase = getSupabaseClient();
      if (!supabase) {
        console.error("[PostAuthHandler] No Supabase client");
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log("[PostAuthHandler] No user, skipping");
        return;
      }

      // Case 1: No subscribe intent - just redirect to return URL (sign-in only)
      if (!subscribeIntent) {
        console.log("[PostAuthHandler] Sign-in only, redirecting to:", returnUrl);
        window.location.href = returnUrl;
        return;
      }

      // Case 2: Subscribe intent - check if already subscribed
      console.log("[PostAuthHandler] Checking subscription status for:", user.id);
      const { data: subscription } = await supabase
        .from("quartz_subscriptions")
        .select("status, current_period_end")
        .eq("user_id", user.id)
        .single();

      const isSubscribed = 
        subscription?.status === "active" && 
        new Date(subscription.current_period_end) > new Date();

      if (isSubscribed) {
        // Already subscribed - just redirect to article
        console.log("[PostAuthHandler] Already subscribed, redirecting to:", returnUrl);
        window.location.href = returnUrl;
        return;
      }

      // Case 3: Not subscribed - create Stripe checkout
      console.log("[PostAuthHandler] Creating checkout for user:", user.id);
      try {
        const response = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            email: user.email,
            returnUrl: returnUrl,
          }),
        });

        const data = await response.json();
        console.log("[PostAuthHandler] Checkout response:", data);

        if (data.url) {
          window.location.href = data.url;
        } else {
          console.error("[PostAuthHandler] No URL in response:", data.error);
          // Fallback to return URL on error
          window.location.href = returnUrl;
        }
      } catch (error) {
        console.error("[PostAuthHandler] Error:", error);
        // Fallback to return URL on error
        window.location.href = returnUrl;
      }
    };

    handlePostAuth();
  }, []);

  return null;
}

