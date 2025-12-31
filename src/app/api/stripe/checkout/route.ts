import { NextRequest, NextResponse } from "next/server";
import { stripe, PRICE_ID } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const { userId, email } = await request.json();

    if (!userId || !email) {
      return NextResponse.json(
        { error: "User ID and email are required" },
        { status: 400 }
      );
    }

    if (!PRICE_ID) {
      return NextResponse.json(
        { error: "Stripe Price ID not configured" },
        { status: 500 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Check if user already has a Stripe customer ID
    const { data: existingSubscription } = await supabase
      .from("quartz_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .single();

    let customerId = existingSubscription?.stripe_customer_id;

    // Create a new customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: {
          supabase_user_id: userId,
        },
      });
      customerId = customer.id;

      // Save customer ID to database
      await supabase.from("quartz_subscriptions").upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        status: "inactive",
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card", "link"],
      line_items: [
        {
          price: PRICE_ID,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${request.nextUrl.origin}?success=true`,
      cancel_url: `${request.nextUrl.origin}?canceled=true`,
      metadata: {
        supabase_user_id: userId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

