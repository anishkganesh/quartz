import Stripe from "stripe";

// Only initialize stripe if the key is available (skip during build)
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : (null as unknown as Stripe);

export const PRICE_ID = process.env.STRIPE_PRICE_ID;

