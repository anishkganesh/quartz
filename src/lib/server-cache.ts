import { createServiceRoleClient } from "./supabase-server";
import { AI_MODEL } from "./openai";

// Cache configuration
export const CACHE_MODEL_VERSION = AI_MODEL; // Changes when model upgrades
export const CACHE_TTL_DAYS = 30;

/**
 * Normalize topic for cache key consistency
 */
export function normalizeTopic(topic: string): string {
  return topic.toLowerCase().trim();
}

/**
 * Check if a cached entry is still valid (within TTL)
 */
export function isCacheValid(createdAt: string): boolean {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays < CACHE_TTL_DAYS;
}

/**
 * Get cached article if valid
 */
export async function getCachedArticle(topic: string): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    const normalizedTopic = normalizeTopic(topic);
    
    const { data, error } = await supabase
      .from("quartz_articles")
      .select("content, created_at")
      .eq("topic", normalizedTopic)
      .eq("model_version", CACHE_MODEL_VERSION)
      .single();
    
    if (error || !data) return null;
    if (!isCacheValid(data.created_at)) return null;
    
    return data.content;
  } catch {
    return null;
  }
}

/**
 * Store article in cache
 */
export async function cacheArticle(topic: string, content: string): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const normalizedTopic = normalizeTopic(topic);
    
    await supabase
      .from("quartz_articles")
      .upsert({
        topic: normalizedTopic,
        content,
        model_version: CACHE_MODEL_VERSION,
        created_at: new Date().toISOString(),
      }, {
        onConflict: "topic,model_version",
      });
  } catch (err) {
    console.error("Failed to cache article:", err);
  }
}

/**
 * Get cached simplification if valid
 */
export async function getCachedSimplification(
  topic: string,
  level: number
): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    const normalizedTopic = normalizeTopic(topic);
    
    const { data, error } = await supabase
      .from("quartz_simplifications")
      .select("content, created_at")
      .eq("topic", normalizedTopic)
      .eq("level", level)
      .eq("model_version", CACHE_MODEL_VERSION)
      .single();
    
    if (error || !data) return null;
    if (!isCacheValid(data.created_at)) return null;
    
    return data.content;
  } catch {
    return null;
  }
}

/**
 * Store simplification in cache
 */
export async function cacheSimplification(
  topic: string,
  level: number,
  content: string
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const normalizedTopic = normalizeTopic(topic);
    
    await supabase
      .from("quartz_simplifications")
      .upsert({
        topic: normalizedTopic,
        level,
        content,
        model_version: CACHE_MODEL_VERSION,
        created_at: new Date().toISOString(),
      }, {
        onConflict: "topic,level,model_version",
      });
  } catch (err) {
    console.error("Failed to cache simplification:", err);
  }
}

/**
 * Get cached audio URL if valid
 */
export async function getCachedAudio(
  topic: string,
  simplificationLevel: number = 0
): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    const normalizedTopic = normalizeTopic(topic);
    
    const { data, error } = await supabase
      .from("quartz_audio")
      .select("audio_url, created_at")
      .eq("topic", normalizedTopic)
      .eq("simplification_level", simplificationLevel)
      .eq("model_version", CACHE_MODEL_VERSION)
      .single();
    
    if (error || !data) return null;
    if (!isCacheValid(data.created_at)) return null;
    
    return data.audio_url;
  } catch {
    return null;
  }
}

/**
 * Store audio in cache (uploads to Storage, stores URL in DB)
 */
export async function cacheAudio(
  topic: string,
  simplificationLevel: number,
  audioBuffer: ArrayBuffer
): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    const normalizedTopic = normalizeTopic(topic);
    const fileName = `${normalizedTopic.replace(/\s+/g, "-")}_level${simplificationLevel}_${CACHE_MODEL_VERSION}.mp3`;
    
    // Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from("quartz-audio")
      .upload(fileName, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });
    
    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return null;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from("quartz-audio")
      .getPublicUrl(fileName);
    
    // Store in database
    await supabase
      .from("quartz_audio")
      .upsert({
        topic: normalizedTopic,
        simplification_level: simplificationLevel,
        audio_url: publicUrl,
        model_version: CACHE_MODEL_VERSION,
        created_at: new Date().toISOString(),
      }, {
        onConflict: "topic,simplification_level,model_version",
      });
    
    return publicUrl;
  } catch (err) {
    console.error("Failed to cache audio:", err);
    return null;
  }
}

/**
 * Get cached podcast if valid
 */
export async function getCachedPodcast(
  topic: string
): Promise<{ script: string; audioUrl: string } | null> {
  try {
    const supabase = createServiceRoleClient();
    const normalizedTopic = normalizeTopic(topic);
    
    const { data, error } = await supabase
      .from("quartz_podcasts")
      .select("script, audio_url, created_at")
      .eq("topic", normalizedTopic)
      .eq("model_version", CACHE_MODEL_VERSION)
      .single();
    
    if (error || !data) return null;
    if (!isCacheValid(data.created_at)) return null;
    
    return { script: data.script, audioUrl: data.audio_url };
  } catch {
    return null;
  }
}

/**
 * Store podcast in cache
 */
export async function cachePodcast(
  topic: string,
  script: string,
  audioBuffer: ArrayBuffer
): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    const normalizedTopic = normalizeTopic(topic);
    const fileName = `podcast_${normalizedTopic.replace(/\s+/g, "-")}_${CACHE_MODEL_VERSION}.mp3`;
    
    // Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from("quartz-audio")
      .upload(fileName, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });
    
    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return null;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from("quartz-audio")
      .getPublicUrl(fileName);
    
    // Store in database
    await supabase
      .from("quartz_podcasts")
      .upsert({
        topic: normalizedTopic,
        script,
        audio_url: publicUrl,
        model_version: CACHE_MODEL_VERSION,
        created_at: new Date().toISOString(),
      }, {
        onConflict: "topic,model_version",
      });
    
    return publicUrl;
  } catch (err) {
    console.error("Failed to cache podcast:", err);
    return null;
  }
}

/**
 * Get cached quiz questions if valid
 */
export async function getCachedQuizQuestions(
  topic: string
): Promise<unknown[] | null> {
  try {
    const supabase = createServiceRoleClient();
    const normalizedTopic = normalizeTopic(topic);
    
    const { data, error } = await supabase
      .from("quartz_quiz_questions")
      .select("questions, created_at")
      .eq("topic", normalizedTopic)
      .eq("model_version", CACHE_MODEL_VERSION)
      .single();
    
    if (error || !data) return null;
    if (!isCacheValid(data.created_at)) return null;
    
    return data.questions as unknown[];
  } catch {
    return null;
  }
}

/**
 * Store quiz questions in cache
 */
export async function cacheQuizQuestions(
  topic: string,
  questions: unknown[]
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const normalizedTopic = normalizeTopic(topic);
    
    await supabase
      .from("quartz_quiz_questions")
      .upsert({
        topic: normalizedTopic,
        questions,
        model_version: CACHE_MODEL_VERSION,
        created_at: new Date().toISOString(),
      }, {
        onConflict: "topic,model_version",
      });
  } catch (err) {
    console.error("Failed to cache quiz questions:", err);
  }
}

