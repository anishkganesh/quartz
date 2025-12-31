"use client";

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export default function PostAuthHandler() {
  useEffect(() => {
    const checkSubscribeIntent = async () => {
      const intent = localStorage.getItem("quartz_subscribe_intent");
      if (!intent) return;

      // Clear the intent immediately to prevent loops
      localStorage.removeItem("quartz_subscribe_intent");

      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // User just signed in with subscribe intent - redirect to Stripe
      try {
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
          console.error("Failed to create checkout session:", data.error);
        }
      } catch (error) {
        console.error("Error creating checkout session:", error);
      }
    };

    checkSubscribeIntent();
  }, []);

  return null;
}

