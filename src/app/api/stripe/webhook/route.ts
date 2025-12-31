import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

// Lazy-initialize Supabase admin client (for webhooks, bypasses RLS)
let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabaseAdmin;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const subscriptionId = session.subscription as string;

        if (userId && subscriptionId) {
          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(subscriptionId) as unknown as {
            current_period_end: number;
          };

          await getSupabaseAdmin().from("quartz_subscriptions").upsert({
            user_id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscriptionId,
            status: "active",
            current_period_end: new Date(
              subscription.current_period_end * 1000
            ).toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as unknown as {
          customer: string;
          status: string;
          current_period_end: number;
        };
        const customerId = subscription.customer;

        // Find user by customer ID
        const { data: existingSubscription } = await getSupabaseAdmin()
          .from("quartz_subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (existingSubscription) {
          await getSupabaseAdmin().from("quartz_subscriptions").update({
            status: subscription.status === "active" ? "active" : subscription.status,
            current_period_end: new Date(
              subscription.current_period_end * 1000
            ).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("user_id", existingSubscription.user_id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as unknown as { customer: string };
        const customerId = subscription.customer;

        // Find user by customer ID
        const { data: existingSubscription } = await getSupabaseAdmin()
          .from("quartz_subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (existingSubscription) {
          await getSupabaseAdmin().from("quartz_subscriptions").update({
            status: "canceled",
            updated_at: new Date().toISOString(),
          }).eq("user_id", existingSubscription.user_id);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as unknown as { customer: string };
        const customerId = invoice.customer;

        // Find user by customer ID
        const { data: existingSubscription } = await getSupabaseAdmin()
          .from("quartz_subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (existingSubscription) {
          await getSupabaseAdmin().from("quartz_subscriptions").update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          }).eq("user_id", existingSubscription.user_id);
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

