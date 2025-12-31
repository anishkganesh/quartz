"use client";

const CACHE_PREFIX = "wikia_";
const CACHE_VERSION = "v1_";

interface CacheEntry {
  content: string;
  simplifiedContent?: string;
  timestamp: number;
  topic: string;
}

export interface RecentTopic {
  name: string;
  timestamp: number;
}

export function getCacheKey(topic: string): string {
  return `${CACHE_PREFIX}${CACHE_VERSION}${topic.toLowerCase().replace(/\s+/g, "_")}`;
}

export function getFromCache(topic: string): CacheEntry | null {
  if (typeof window === "undefined") return null;
  
  try {
    const key = getCacheKey(topic);
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    return JSON.parse(cached) as CacheEntry;
  } catch {
    return null;
  }
}

export function saveToCache(topic: string, content: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const key = getCacheKey(topic);
    const entry: CacheEntry = {
      content,
      timestamp: Date.now(),
      topic,
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    // Handle quota exceeded
    console.warn("Cache storage failed:", e);
    clearOldCache();
  }
}

export function saveSimplifiedToCache(topic: string, simplifiedContent: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const key = getCacheKey(topic);
    const cached = localStorage.getItem(key);
    if (!cached) return;
    
    const entry = JSON.parse(cached) as CacheEntry;
    entry.simplifiedContent = simplifiedContent;
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    console.warn("Cache update failed:", e);
  }
}

export function clearOldCache(): void {
  if (typeof window === "undefined") return;
  
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) {
      keys.push(key);
    }
  }
  
  // Remove oldest entries (keep last 50)
  if (keys.length > 50) {
    const entries = keys
      .map((key) => {
        try {
          const data = localStorage.getItem(key);
          if (!data) return null;
          const parsed = JSON.parse(data) as CacheEntry;
          return { key, timestamp: parsed.timestamp };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as { key: string; timestamp: number }[];
    
    entries.sort((a, b) => a.timestamp - b.timestamp);
    
    const toRemove = entries.slice(0, entries.length - 50);
    toRemove.forEach(({ key }) => localStorage.removeItem(key));
  }
}

export function getRecentTopics(limit = 10): RecentTopic[] {
  if (typeof window === "undefined") return [];
  
  try {
    const recent = localStorage.getItem("quartz_recent_topics");
    if (recent) {
      const topics = JSON.parse(recent) as RecentTopic[];
      // Handle legacy format (string array)
      if (topics.length > 0 && typeof topics[0] === 'string') {
        return (topics as unknown as string[]).slice(0, limit).map(name => ({
          name,
          timestamp: Date.now()
        }));
      }
      return topics.slice(0, limit);
    }
  } catch {
    // Fall back to cache-based recent
  }
  
  const entries: RecentTopic[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX + CACHE_VERSION)) {
      try {
        const data = localStorage.getItem(key);
        if (data) {
          const parsed = JSON.parse(data) as CacheEntry;
          entries.push({ name: parsed.topic, timestamp: parsed.timestamp });
        }
      } catch {
        // Skip invalid entries
      }
    }
  }
  
  return entries
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

export function addRecentTopic(topic: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const recent = localStorage.getItem("quartz_recent_topics");
    let topics: RecentTopic[] = recent ? JSON.parse(recent) : [];
    
    // Handle legacy format (string array)
    if (topics.length > 0 && typeof topics[0] === 'string') {
      topics = (topics as unknown as string[]).map(name => ({
        name,
        timestamp: Date.now()
      }));
    }
    
    // Remove if already exists
    topics = topics.filter((t) => t.name.toLowerCase() !== topic.toLowerCase());
    
    // Add to front with current timestamp
    topics.unshift({ name: topic, timestamp: Date.now() });
    
    // Keep only last 20
    topics = topics.slice(0, 20);
    
    localStorage.setItem("quartz_recent_topics", JSON.stringify(topics));
  } catch {
    // Ignore errors
  }
}
