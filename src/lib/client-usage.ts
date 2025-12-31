// Client-side usage tracking for anonymous users
// Uses localStorage to track daily article generation

const STORAGE_KEY = "quartz_anon_usage";
const ANON_DAILY_LIMIT = 3;
const LOGGED_IN_DAILY_LIMIT = 10;

interface AnonUsage {
  date: string;
  count: number;
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export function getAnonUsage(): AnonUsage {
  if (typeof window === "undefined") {
    return { date: getToday(), count: 0 };
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const usage = JSON.parse(stored) as AnonUsage;
      // Reset if it's a new day
      if (usage.date !== getToday()) {
        return { date: getToday(), count: 0 };
      }
      return usage;
    }
  } catch {
    // Invalid data, reset
  }
  return { date: getToday(), count: 0 };
}

export function incrementAnonUsage(): void {
  if (typeof window === "undefined") return;
  
  const usage = getAnonUsage();
  usage.count += 1;
  usage.date = getToday();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
}

export function checkAnonLimit(): { canGenerate: boolean; remaining: number; limit: number } {
  const usage = getAnonUsage();
  const remaining = Math.max(0, ANON_DAILY_LIMIT - usage.count);
  return {
    canGenerate: usage.count < ANON_DAILY_LIMIT,
    remaining,
    limit: ANON_DAILY_LIMIT,
  };
}

// Export limits for use in components
export const LIMITS = {
  anonymous: ANON_DAILY_LIMIT,
  loggedIn: LOGGED_IN_DAILY_LIMIT,
  subscriber: Infinity,
};

