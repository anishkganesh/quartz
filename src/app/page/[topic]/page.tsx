"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { X } from "lucide-react";
import ArticleHeader from "@/components/ArticleHeader";
import TableOfContents from "@/components/TableOfContents";
import FeatureToolbar, { FeatureType } from "@/components/FeatureToolbar";
import WikiContent from "@/components/WikiContent";
import SimplifyPanel from "@/components/SimplifyPanel";
import AudioPlayer from "@/components/AudioPlayer";
import PodcastPanel, { DialogueLine } from "@/components/PodcastPanel";
import QuizPanel, { Question } from "@/components/QuizPanel";
import ChatPanel from "@/components/ChatPanel";
import TextSelectionPopup from "@/components/TextSelectionPopup";
import RelatedQuestions from "@/components/RelatedQuestions";
import PaywallModal from "@/components/PaywallModal";
import { BreadcrumbItem } from "@/components/Breadcrumbs";
import { getFromCache, saveToCache, addRecentTopic } from "@/lib/cache";
import { toTitleCase } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import { checkAnonLimit, incrementAnonUsage, LIMITS } from "@/lib/client-usage";

interface PanelState {
  topic: string;
  label: string;
  content: string;
  simplifiedContents: Record<number, string>;
  simplifyLevel: number;
}

export default function WikiPage() {
  const params = useParams();
  const rootTopic = decodeURIComponent(params.topic as string);
  const rootLabel = rootTopic.replace(/_/g, " ");

  // Initialize theme on mount
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") {
      document.documentElement.setAttribute("data-theme", stored);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  // Panel stack
  const [panelStack, setPanelStack] = useState<PanelState[]>([
    {
      topic: rootTopic,
      label: rootLabel,
      content: "",
      simplifiedContents: {},
      simplifyLevel: 1,
    },
  ]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Feature panel state
  const [activeFeature, setActiveFeature] = useState<FeatureType>(null);

  // Cached audio/podcast/quiz/video data - keyed by topic
  const [cachedAudioUrls, setCachedAudioUrls] = useState<Record<string, string>>({});
  const [cachedPodcastData, setCachedPodcastData] = useState<Record<string, { dialogue: DialogueLine[], audioUrl: string | null }>>({});
  const [cachedQuizData, setCachedQuizData] = useState<Record<string, Question[]>>({});

  // Page-level audio refs and state for persistent playback
  const audifyAudioRef = useRef<HTMLAudioElement | null>(null);
  const podifyAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isAudifyGenerating, setIsAudifyGenerating] = useState(false);
  const [isPodifyGenerating, setIsPodifyGenerating] = useState(false);
  const [audifyIsPlaying, setAudifyIsPlaying] = useState(false);
  const [podifyIsPlaying, setPodifyIsPlaying] = useState(false);
  const audioGeneratingRef = useRef<Set<string>>(new Set());

  // Active section for TOC
  const [activeSection, setActiveSection] = useState<string>("");

  // Text selection popup
  const [selectionPopup, setSelectionPopup] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  // Chat initial message
  const [chatInitialMessage, setChatInitialMessage] = useState<string>("");

  // Paywall state
  const [showPaywall, setShowPaywall] = useState(false);
  const [usageInfo, setUsageInfo] = useState<{ used: number; limit: number }>({ used: 0, limit: LIMITS.anonymous });
  const supabase = getSupabaseClient();
  const usageCheckedRef = useRef<Set<string>>(new Set());
  
  // Track generating topics to prevent double-generation
  const generatingRef = useRef<Set<string>>(new Set());
  
  // AbortController for canceling in-flight generations
  const abortControllerRef = useRef<AbortController | null>(null);


  // Load content for root panel
  useEffect(() => {
    loadContent(rootTopic);
    addRecentTopic(rootLabel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootTopic, rootLabel]);

  // Update tab title based on active panel
  useEffect(() => {
    if (panelStack.length > 0) {
      const activePanel = panelStack[panelStack.length - 1];
      document.title = toTitleCase(activePanel.label);
    }
  }, [panelStack]);

  // Background audio generation for Audify
  const generateAudifyAudio = useCallback(async (topic: string, content: string) => {
    const cacheKey = `audify-${topic}`;
    if (audioGeneratingRef.current.has(cacheKey) || cachedAudioUrls[topic]) return;
    
    audioGeneratingRef.current.add(cacheKey);
    setIsAudifyGenerating(true);
    
    try {
      const response = await fetch("/api/audify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, content }),
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setCachedAudioUrls(prev => ({ ...prev, [topic]: url }));
      }
    } catch (err) {
      console.error("Audify generation failed:", err);
    } finally {
      audioGeneratingRef.current.delete(cacheKey);
      setIsAudifyGenerating(false);
    }
  }, [cachedAudioUrls]);

  // Background audio generation for Podify
  const generatePodifyAudio = useCallback(async (topic: string, content: string) => {
    const cacheKey = `podify-${topic}`;
    if (audioGeneratingRef.current.has(cacheKey) || cachedPodcastData[topic]?.audioUrl) return;
    
    audioGeneratingRef.current.add(cacheKey);
    setIsPodifyGenerating(true);
    
    try {
      const response = await fetch("/api/podcastify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, content }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setCachedPodcastData(prev => ({ 
          ...prev, 
          [topic]: { dialogue: data.dialogue, audioUrl: data.audioUrl } 
        }));
      }
    } catch (err) {
      console.error("Podify generation failed:", err);
    } finally {
      audioGeneratingRef.current.delete(cacheKey);
      setIsPodifyGenerating(false);
    }
  }, [cachedPodcastData]);

  const loadContent = useCallback(async (topic: string) => {
    // Abort any previous generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new AbortController for this generation
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    // Clear previous generating state and set new
    generatingRef.current.clear();
    generatingRef.current.add(topic);
    
    setIsLoading(true);
    setIsStreaming(false);
    setError(null);

    // Check cache first - cached content doesn't count against limit
    const cached = getFromCache(topic);
    if (cached) {
      setPanelStack((prev) => {
        const updated = [...prev];
        // Find the panel with matching topic
        const targetIndex = updated.findIndex(p => p.topic === topic);
        if (targetIndex !== -1) {
          updated[targetIndex] = {
            ...updated[targetIndex],
            content: cached.content,
            simplifiedContents: { 1: cached.content },
          };
        }
        return updated;
      });
      setIsLoading(false);
      generatingRef.current.delete(topic);
      return;
    }

    // Check usage limit before generating new content (skip in dev mode)
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev && !usageCheckedRef.current.has(topic)) {
      let user = null;
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        user = data.user;
      }
      
      if (!user) {
        // Anonymous user - check localStorage
        const anonLimit = checkAnonLimit();
        if (!anonLimit.canGenerate) {
          setUsageInfo({ used: LIMITS.anonymous, limit: LIMITS.anonymous });
          setShowPaywall(true);
          setIsLoading(false);
          generatingRef.current.delete(topic);
          return;
        }
        // Increment immediately on click (before generation)
        incrementAnonUsage();
      }
      // Note: Logged-in users are checked server-side in the API
    }

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
        signal: controller.signal,
      });

      // Check for rate limit (JSON response) - skip in dev mode
      if (!isDev && response.status === 429) {
        const data = await response.json();
        setUsageInfo({ used: data.currentUsage || LIMITS.loggedIn, limit: LIMITS.loggedIn });
        setShowPaywall(true);
        setIsLoading(false);
        return;
      }

      if (!response.ok) throw new Error("Failed to generate");

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let fullContent = "";

      // Show streaming state - content is arriving
      setIsLoading(false);
      setIsStreaming(true);

      while (true) {
        // Check if aborted
        if (controller.signal.aborted) {
          reader.cancel();
          return;
        }
        
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === "section") {
                // Append section content
                fullContent += data.content;
                
                // Update panel with current content - find by topic to avoid index mismatch
                setPanelStack((prev) => {
                  const updated = [...prev];
                  // Find the panel with matching topic
                  const targetIndex = updated.findIndex(p => p.topic === topic);
                  if (targetIndex !== -1) {
                    updated[targetIndex] = {
                      ...updated[targetIndex],
                      content: fullContent,
                      simplifiedContents: { 1: fullContent },
                    };
                  }
                  return updated;
                });
              } else if (data.type === "done") {
                // Final content - cache it
                saveToCache(topic, data.content);
                usageCheckedRef.current.add(topic);

                // Final update with complete content - find by topic to avoid index mismatch
                setPanelStack((prev) => {
                  const updated = [...prev];
                  // Find the panel with matching topic
                  const targetIndex = updated.findIndex(p => p.topic === topic);
                  if (targetIndex !== -1) {
                    updated[targetIndex] = {
                      ...updated[targetIndex],
                      content: data.content,
                      simplifiedContents: { 1: data.content },
                    };
                  }
                  return updated;
                });
              } else if (data.type === "error") {
                throw new Error(data.message);
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      setIsStreaming(false);
      generatingRef.current.delete(topic);
    } catch (err) {
      // Ignore abort errors - these are intentional cancellations
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError("Failed to load article");
      console.error(err);
      setIsLoading(false);
      setIsStreaming(false);
      generatingRef.current.delete(topic);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // Handle concept click - open new panel
  const handleConceptClick = useCallback((concept: string) => {
    const formattedTopic = concept.replace(/\s+/g, "_");
    
    const newPanel: PanelState = {
      topic: formattedTopic,
      label: concept,
      content: "",
      simplifiedContents: {},
      simplifyLevel: 1,
    };
    
    setPanelStack((prev) => [...prev, newPanel]);
    
    // Update URL to new topic (without full navigation)
    window.history.pushState({}, "", `/page/${formattedTopic}`);
    
    // Load content directly - AbortController handles any duplicate calls
    loadContent(formattedTopic);

    addRecentTopic(concept);
  }, [loadContent]);

  // Handle breadcrumb navigation
  const handleBreadcrumbNavigate = useCallback((index: number) => {
    setPanelStack((prev) => {
      const newStack = prev.slice(0, index + 1);
      // Update URL to the topic at this index
      if (newStack.length > 0) {
        const topic = newStack[newStack.length - 1].topic;
        window.history.pushState({}, "", `/page/${topic}`);
      }
      return newStack;
    });
  }, []);

  // Handle panel close
  const handleClosePanel = useCallback((index: number) => {
    setPanelStack((prev) => {
      const newStack = prev.slice(0, index);
      // Update URL to the last remaining topic
      if (newStack.length > 0) {
        const topic = newStack[newStack.length - 1].topic;
        window.history.pushState({}, "", `/page/${topic}`);
      }
      return newStack;
    });
  }, []);

  // Handle section click (TOC)
  const handleSectionClick = useCallback((id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Handle active section change from scroll
  const handleActiveChange = useCallback((id: string) => {
    setActiveSection(id);
  }, []);

  // Handle simplify level change
  const handleSimplifyLevelChange = useCallback(
    (level: number, content: string) => {
      setPanelStack((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        updated[lastIndex] = {
          ...updated[lastIndex],
          simplifyLevel: level,
          simplifiedContents: {
            ...updated[lastIndex].simplifiedContents,
            [level]: content,
          },
        };
        return updated;
      });
    },
    []
  );

  // Handle Audify toggle - start generation in background and open panel
  // Only generate audio if article is fully loaded (not streaming or loading)
  const handleAudifyToggle = useCallback(() => {
    const panel = panelStack[panelStack.length - 1];
    // Only start generation if article is fully loaded
    if (panel.content && !isLoading && !isStreaming && !cachedAudioUrls[panel.topic]) {
      generateAudifyAudio(panel.topic, panel.content);
    }
    setActiveFeature(prev => prev === "audio" ? null : "audio");
  }, [panelStack, cachedAudioUrls, generateAudifyAudio, isLoading, isStreaming]);

  // Handle Podify toggle - start generation in background and open panel
  // Only generate audio if article is fully loaded (not streaming or loading)
  const handlePodifyToggle = useCallback(() => {
    const panel = panelStack[panelStack.length - 1];
    // Only start generation if article is fully loaded
    if (panel.content && !isLoading && !isStreaming && !cachedPodcastData[panel.topic]?.audioUrl) {
      generatePodifyAudio(panel.topic, panel.content);
    }
    setActiveFeature(prev => prev === "podcast" ? null : "podcast");
  }, [panelStack, cachedPodcastData, generatePodifyAudio, isLoading, isStreaming]);

  // Handle text selection
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      const text = selection.toString().trim();
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      setSelectionPopup({
        text,
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
      });
    } else {
      setSelectionPopup(null);
    }
  }, []);

  // Handle ask GPT from selection - opens chat with quoted text
  const handleAskGpt = useCallback((quotedText: string) => {
    setChatInitialMessage(quotedText);
    setActiveFeature("chat");
    setSelectionPopup(null);
  }, []);

  // Close selection popup on click outside
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't trigger if clicking inside the popup
      if (target.closest('.text-selection-popup')) {
        return;
      }
      handleTextSelection();
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Only close popup when clicking outside of it and no selection
      if (!target.closest('.text-selection-popup')) {
        setTimeout(() => {
          const selection = window.getSelection();
          if (!selection || selection.toString().trim().length === 0) {
            setSelectionPopup(null);
          }
        }, 150);
      }
    };
    
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleTextSelection]);

  // Handle podcast generation callback
  const handlePodcastGenerated = useCallback((topic: string, dialogue: DialogueLine[], audioUrl: string | null) => {
    setCachedPodcastData(prev => ({ ...prev, [topic]: { dialogue, audioUrl } }));
  }, []);

  // Handle quiz generation callback
  const handleQuizGenerated = useCallback((topic: string, questions: Question[]) => {
    setCachedQuizData(prev => ({ ...prev, [topic]: questions }));
  }, []);

  // Get current active panel
  const activePanel = panelStack[panelStack.length - 1];

  // Breadcrumb items
  const breadcrumbItems: BreadcrumbItem[] = panelStack.map((panel) => ({
    topic: panel.topic,
    label: panel.label,
  }));

  // Check if feature panel is open
  const isFeaturePanelOpen = activeFeature !== null;

  return (
    <div className="min-h-screen bg-background">
      {/* Hidden persistent audio elements - stay mounted for background playback */}
      <audio
        ref={audifyAudioRef}
        src={cachedAudioUrls[activePanel.topic] || ""}
        onPlay={() => setAudifyIsPlaying(true)}
        onPause={() => setAudifyIsPlaying(false)}
        onEnded={() => setAudifyIsPlaying(false)}
      />
      <audio
        ref={podifyAudioRef}
        src={cachedPodcastData[activePanel.topic]?.audioUrl || ""}
        onPlay={() => setPodifyIsPlaying(true)}
        onPause={() => setPodifyIsPlaying(false)}
        onEnded={() => setPodifyIsPlaying(false)}
      />
      
      <ArticleHeader
        breadcrumbs={breadcrumbItems}
        onBreadcrumbNavigate={handleBreadcrumbNavigate}
      />

      <div className="article-layout" style={{ marginTop: '56px' }}>
        {/* Left Sidebar - Table of Contents */}
        {activePanel.content && (
          <TableOfContents
            content={activePanel.content}
            activeSection={activeSection}
            onSectionClick={handleSectionClick}
            onActiveChange={handleActiveChange}
          />
        )}

        {/* Main Content Area */}
        <main 
          className="main-content"
        >
          <div 
            className={`panel-container ${isFeaturePanelOpen ? 'feature-open' : ''}`}
          >
            {/* Only show last 2 panels: previous (25%) + current (75%) */}
            {panelStack.slice(-2).map((panel, sliceIndex) => {
              const actualIndex = panelStack.length - 2 + sliceIndex;
              const adjustedIndex = Math.max(0, actualIndex);
              const isFirst = sliceIndex === 0 && panelStack.length > 1;
              const isLast = sliceIndex === (panelStack.length > 1 ? 1 : 0);
              const hasTwoPanels = panelStack.length > 1;
              
              return (
                <div
                  key={`${panel.topic}-${adjustedIndex}`}
                  className={`article-panel ${isFirst ? 'main has-sub' : hasTwoPanels ? 'sub' : 'main'}`}
                >
                  <div className="panel-content">
                    <div className="panel-header">
                      <h1>{toTitleCase(panel.label)}</h1>
                      {hasTwoPanels && isLast && (
                        <button
                          onClick={() => handleClosePanel(panelStack.length - 1)}
                          className="panel-close"
                          aria-label="Close panel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {isLoading && isLast ? (
                      <div className="space-y-4">
                        <div className="skeleton h-4 w-full" />
                        <div className="skeleton h-4 w-full" />
                        <div className="skeleton h-4 w-5/6" />
                        <div className="skeleton h-4 w-full" />
                        <div className="skeleton h-8 w-1/3 mt-8" />
                        <div className="skeleton h-4 w-full" />
                        <div className="skeleton h-4 w-4/5" />
                      </div>
                    ) : error && isLast ? (
                      <div className="text-center py-16">
                        <p className="text-foreground-muted">{error}</p>
                        <button
                          onClick={() => loadContent(panel.topic)}
                          className="mt-4 px-4 py-2 rounded-lg hover:shadow-lg transition-shadow"
                        >
                          Try Again
                        </button>
                      </div>
                    ) : (
                      <>
                        <WikiContent
                          content={panel.content}
                          onConceptClick={handleConceptClick}
                        />
                        {/* Skeleton loader for next section while streaming */}
                        {isStreaming && isLast && (
                          <div className="section-skeleton">
                            <div className="skeleton skeleton-heading" />
                            <div className="skeleton skeleton-line" />
                            <div className="skeleton skeleton-line" />
                            <div className="skeleton skeleton-line-short" />
                            <div className="skeleton skeleton-line" />
                            <div className="skeleton skeleton-line-medium" />
                          </div>
                        )}
                        {/* Related Questions - only on main panel when not streaming */}
                        {isLast && panel.content && !isStreaming && (
                          <RelatedQuestions
                            topic={panel.topic}
                            content={panel.content}
                            onQuestionClick={(question) => {
                              setChatInitialMessage(question);
                              setActiveFeature("chat");
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        {/* Right Sidebar - Feature Toolbar */}
        <FeatureToolbar
          activeFeature={activeFeature}
          onFeatureClick={(feature) => {
            // Handle Audify specially - start background generation
            if (feature === "audio") {
              handleAudifyToggle();
              return;
            }
            // Handle Podify specially - start background generation
            if (feature === "podcast") {
              handlePodifyToggle();
              return;
            }
            setActiveFeature(feature);
          }}
          onSpeechQuestion={(question) => {
            setChatInitialMessage(question);
            setActiveFeature("chat");
          }}
          onSpeechTopic={(topic) => {
            handleConceptClick(topic);
          }}
        />

        {/* Feature Panels */}
        {activeFeature === "simplify" && (
          <SimplifyPanel
            topic={activePanel.topic}
            originalContent={activePanel.content}
            currentLevel={activePanel.simplifyLevel}
            onLevelChange={handleSimplifyLevelChange}
            onClose={() => setActiveFeature(null)}
            onConceptClick={handleConceptClick}
            simplifiedContents={activePanel.simplifiedContents}
          />
        )}

        {activeFeature === "audio" && (
          <AudioPlayer
            topic={activePanel.topic}
            content={activePanel.content}
            onClose={() => setActiveFeature(null)}
            cachedAudioUrl={cachedAudioUrls[activePanel.topic]}
            onAudioGenerated={(url) => setCachedAudioUrls(prev => ({ ...prev, [activePanel.topic]: url }))}
            externalAudioRef={audifyAudioRef}
            isGenerating={isAudifyGenerating}
            isPlaying={audifyIsPlaying}
          />
        )}

        {activeFeature === "podcast" && (
          <PodcastPanel
            topic={activePanel.topic}
            content={activePanel.content}
            onClose={() => setActiveFeature(null)}
            cachedDialogue={cachedPodcastData[activePanel.topic]?.dialogue}
            cachedAudioUrl={cachedPodcastData[activePanel.topic]?.audioUrl}
            onPodcastGenerated={(dialogue, audioUrl) => {
              handlePodcastGenerated(activePanel.topic, dialogue, audioUrl);
            }}
            externalAudioRef={podifyAudioRef}
            isGenerating={isPodifyGenerating}
            isPlaying={podifyIsPlaying}
          />
        )}

        {activeFeature === "quiz" && (
          <QuizPanel
            topic={activePanel.topic}
            content={activePanel.content}
            onClose={() => setActiveFeature(null)}
            cachedQuestions={cachedQuizData[activePanel.topic]}
            onQuestionsGenerated={(questions) => handleQuizGenerated(activePanel.topic, questions)}
          />
        )}

        {activeFeature === "chat" && (
          <ChatPanel
            topic={activePanel.topic}
            content={activePanel.content}
            onClose={() => {
              setActiveFeature(null);
              setChatInitialMessage("");
            }}
            initialMessage={chatInitialMessage}
          />
        )}

        {/* Text Selection Popup */}
        {selectionPopup && (
          <TextSelectionPopup
            selectedText={selectionPopup.text}
            x={selectionPopup.x}
            y={selectionPopup.y}
            onAskGpt={handleAskGpt}
            onClose={() => setSelectionPopup(null)}
          />
        )}

        {/* Paywall Modal */}
        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          currentUsage={usageInfo.used}
          limit={usageInfo.limit}
        />

      </div>
    </div>
  );
}
