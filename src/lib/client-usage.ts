// Client-side usage tracking for anonymous users
// Uses localStorage to track total article generation (not daily)

const STORAGE_KEY = "quartz_anon_usage";
const ANON_TOTAL_LIMIT = 3;       // Total lifetime, not daily
const LOGGED_IN_DAILY_LIMIT = 10; // Per day

interface AnonUsage {
  count: number;
}

export function getAnonUsage(): AnonUsage {
  if (typeof window === "undefined") {
    return { count: 0 };
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const usage = JSON.parse(stored) as AnonUsage;
      return { count: usage.count || 0 };
    }
  } catch {
    // Invalid data, reset
  }
  return { count: 0 };
}

export function incrementAnonUsage(): void {
  if (typeof window === "undefined") return;
  
  const usage = getAnonUsage();
  const newCount = usage.count + 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ count: newCount }));
}

export function checkAnonLimit(): { canGenerate: boolean; remaining: number; limit: number } {
  const usage = getAnonUsage();
  const remaining = Math.max(0, ANON_TOTAL_LIMIT - usage.count);
  return {
    canGenerate: usage.count < ANON_TOTAL_LIMIT,
    remaining,
    limit: ANON_TOTAL_LIMIT,
  };
}

// Export limits for use in components
export const LIMITS = {
  anonymous: ANON_TOTAL_LIMIT,
  loggedIn: LOGGED_IN_DAILY_LIMIT,
  subscriber: Infinity,
};

