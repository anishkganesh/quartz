import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { stripe, PRICE_ID } from "@/lib/stripe";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/";
  const shouldSubscribe = requestUrl.searchParams.get("subscribe") === "true";
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);

    // If subscribe flag is set and we have a session, redirect to Stripe
    if (shouldSubscribe && session?.user && !error) {
      try {
        const user = session.user;
        const serviceSupabase = createServiceRoleClient();

        // Check if user already has a Stripe customer ID
        const { data: existingSubscription } = await serviceSupabase
          .from("quartz_subscriptions")
          .select("stripe_customer_id")
          .eq("user_id", user.id)
          .single();

        let customerId = existingSubscription?.stripe_customer_id;

        // Create a new customer if needed
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: user.email!,
            metadata: { supabase_user_id: user.id },
          });
          customerId = customer.id;

          await serviceSupabase.from("quartz_subscriptions").upsert({
            user_id: user.id,
            stripe_customer_id: customerId,
            status: "inactive",
          });
        }

        // Create checkout session
        const checkoutSession = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ["card", "link"],
          line_items: [{ price: PRICE_ID!, quantity: 1 }],
          mode: "subscription",
          success_url: `${origin}${next}?success=true`,
          cancel_url: `${origin}${next}?canceled=true`,
          metadata: { supabase_user_id: user.id },
        });

        if (checkoutSession.url) {
          return NextResponse.redirect(checkoutSession.url);
        }
      } catch (err) {
        console.error("Error creating Stripe checkout after auth:", err);
        // Fall through to normal redirect on error
      }
    }
  }

  // Redirect to next path or home
  return NextResponse.redirect(`${origin}${next}`);
}

