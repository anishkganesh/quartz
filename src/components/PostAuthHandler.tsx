"use client";

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export default function PostAuthHandler() {
  useEffect(() => {
    const checkSubscribeIntent = async () => {
      const intent = localStorage.getItem("quartz_subscribe_intent");
      const returnUrl = localStorage.getItem("quartz_return_url");
      console.log("[PostAuthHandler] Checking intent:", intent, "returnUrl:", returnUrl);
      if (!intent) return;

      // Clear the intent and return URL immediately to prevent loops
      localStorage.removeItem("quartz_subscribe_intent");
      localStorage.removeItem("quartz_return_url");

      const supabase = getSupabaseClient();
      console.log("[PostAuthHandler] Supabase client:", !!supabase);
      if (!supabase) {
        console.error("[PostAuthHandler] No Supabase client");
        return;
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log("[PostAuthHandler] User:", user?.email, "Error:", userError);
      if (!user) {
        console.error("[PostAuthHandler] No user found");
        return;
      }

      // User just signed in with subscribe intent - redirect to Stripe
      console.log("[PostAuthHandler] Creating checkout for user:", user.id);
      try {
        const response = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            email: user.email,
            returnUrl: returnUrl || "/",
          }),
        });

        const data = await response.json();
        console.log("[PostAuthHandler] Checkout response:", data);

        if (data.url) {
          console.log("[PostAuthHandler] Redirecting to:", data.url);
          window.location.href = data.url;
        } else {
          console.error("[PostAuthHandler] No URL in response:", data.error);
        }
      } catch (error) {
        console.error("[PostAuthHandler] Error:", error);
      }
    };

    checkSubscribeIntent();
  }, []);

  return null;
}

