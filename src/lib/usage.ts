import { SupabaseClient } from "@supabase/supabase-js";

const FREE_DAILY_LIMIT = 3;

interface UsageResult {
  canGenerate: boolean;
  currentCount: number;
  limit: number;
  isSubscribed: boolean;
}

export async function checkUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<UsageResult> {
  // Check if user has active subscription
  const { data: subscription } = await supabase
    .from("quartz_subscriptions")
    .select("status, current_period_end")
    .eq("user_id", userId)
    .single();

  const isSubscribed =
    subscription?.status === "active" &&
    new Date(subscription.current_period_end) > new Date();

  // Subscribers have unlimited access
  if (isSubscribed) {
    return {
      canGenerate: true,
      currentCount: 0,
      limit: Infinity,
      isSubscribed: true,
    };
  }

  // Get today's usage for free users
  const today = new Date().toISOString().split("T")[0];
  const { data: usage } = await supabase
    .from("quartz_usage")
    .select("article_count")
    .eq("user_id", userId)
    .eq("date", today)
    .single();

  const currentCount = usage?.article_count ?? 0;

  return {
    canGenerate: currentCount < FREE_DAILY_LIMIT,
    currentCount,
    limit: FREE_DAILY_LIMIT,
    isSubscribed: false,
  };
}

export async function incrementUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  // Try to update existing record first
  const { data: existing } = await supabase
    .from("quartz_usage")
    .select("id, article_count")
    .eq("user_id", userId)
    .eq("date", today)
    .single();

  if (existing) {
    // Update existing record
    await supabase
      .from("quartz_usage")
      .update({
        article_count: existing.article_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    // Insert new record for today
    await supabase.from("quartz_usage").insert({
      user_id: userId,
      date: today,
      article_count: 1,
    });
  }
}

export async function getUsageStats(
  supabase: SupabaseClient,
  userId: string
): Promise<{ used: number; limit: number; isSubscribed: boolean }> {
  const result = await checkUsage(supabase, userId);
  return {
    used: result.currentCount,
    limit: result.limit,
    isSubscribed: result.isSubscribed,
  };
}

