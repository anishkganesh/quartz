"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { X } from "lucide-react";
import ArticleHeader from "@/components/ArticleHeader";
import TableOfContents from "@/components/TableOfContents";
import FeatureToolbar, { FeatureType } from "@/components/FeatureToolbar";
import WikiContent from "@/components/WikiContent";
import SimplifyPanel from "@/components/SimplifyPanel";
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
  const [, setIsPodcastPlaying] = useState(false);
  const [podcastInitialized, setPodcastInitialized] = useState(false);

  // Cached audio/podcast/quiz/video data - keyed by topic
  const [cachedPodcastData, setCachedPodcastData] = useState<Record<string, { dialogue: DialogueLine[], audioUrl: string | null }>>({});
  const [cachedQuizData, setCachedQuizData] = useState<Record<string, Question[]>>({});

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


  // Load content for root panel
  useEffect(() => {
    loadContent(rootTopic, 0);
    addRecentTopic(rootLabel);
  }, [rootTopic, rootLabel]);

  // Update tab title based on active panel
  useEffect(() => {
    if (panelStack.length > 0) {
      const activePanel = panelStack[panelStack.length - 1];
      document.title = toTitleCase(activePanel.label);
    }
  }, [panelStack]);

  const loadContent = async (topic: string, panelIndex: number) => {
    setIsLoading(true);
    setIsStreaming(false);
    setError(null);

    // Check cache first - cached content doesn't count against limit
    const cached = getFromCache(topic);
    if (cached) {
      setPanelStack((prev) => {
        const updated = [...prev];
        updated[panelIndex] = {
          ...updated[panelIndex],
          content: cached.content,
          simplifiedContents: { 1: cached.content },
        };
        return updated;
      });
      setIsLoading(false);
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
          return;
        }
      }
      // Note: Logged-in users are checked server-side in the API
    }

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
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
                
                // Update panel with current content
                setPanelStack((prev) => {
                  const updated = [...prev];
                  if (updated[panelIndex]) {
                    updated[panelIndex] = {
                      ...updated[panelIndex],
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
                
                // Increment anonymous usage (skip in dev mode)
                if (!isDev) {
                  let currentUser = null;
                  if (supabase) {
                    const { data: userData } = await supabase.auth.getUser();
                    currentUser = userData.user;
                  }
                  if (!currentUser) {
                    incrementAnonUsage();
                  }
                }

                // Final update with complete content
                setPanelStack((prev) => {
                  const updated = [...prev];
                  if (updated[panelIndex]) {
                    updated[panelIndex] = {
                      ...updated[panelIndex],
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
    } catch (err) {
      setError("Failed to load article");
      console.error(err);
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  // Handle concept click - open new panel
  const handleConceptClick = useCallback((concept: string) => {
    const formattedTopic = concept.replace(/\s+/g, "_");
    const newIndex = panelStack.length; // Get index BEFORE state update
    
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
    
    // Load content OUTSIDE state setter to avoid double-call in Strict Mode
    setTimeout(() => {
      loadContent(formattedTopic, newIndex);
    }, 0);

    addRecentTopic(concept);
  }, [panelStack.length, loadContent, addRecentTopic]);

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

  // Handle Audify toggle - play/stop using Browser Speech Synthesis (instant, free, streaming)
  const handleAudifyToggle = useCallback(() => {
    // Check if speech synthesis is available
    if (!window.speechSynthesis) {
      console.error("Speech synthesis not supported");
      return;
    }

    // If speaking, stop it
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      return;
    }

    // Get the active panel content
    const activePanel = panelStack[panelStack.length - 1];
    if (!activePanel?.content) return;

    // Use simplified content if Simplify panel is open, otherwise use main content
    const contentToRead = activeFeature === "simplify" 
      ? (activePanel.simplifiedContents[activePanel.simplifyLevel] || activePanel.content)
      : activePanel.content;

    // Clean up the text for speech - remove markdown formatting
    const cleanText = contentToRead
      .replace(/\[\[([^\]]+)\]\]/g, "$1") // Remove [[ ]] brackets
      .replace(/#{1,6}\s*/g, "") // Remove headings markers
      .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove bold
      .replace(/\*([^*]+)\*/g, "$1") // Remove italic
      .replace(/`([^`]+)`/g, "$1") // Remove code
      .replace(/\$\$[\s\S]*?\$\$/g, "") // Remove block math
      .replace(/\$[^$]+\$/g, "") // Remove inline math
      .replace(/\n{2,}/g, ". ") // Convert double newlines to pauses
      .replace(/\n/g, " ") // Convert single newlines to spaces
      .trim();

    // Create utterance
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0; // Normal speed
    utterance.pitch = 1.0; // Normal pitch
    
    // Try to use a good voice (prefer Google voices on Chrome)
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Daniel")
    ) || voices[0];
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    // Start speaking
    window.speechSynthesis.speak(utterance);
  }, [panelStack, activeFeature]);

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
                          onClick={() => loadContent(panel.topic, adjustedIndex)}
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
                            <div className="skeleton h-6 w-2/5 mt-8 mb-4" />
                            <div className="skeleton h-4 w-full" />
                            <div className="skeleton h-4 w-full" />
                            <div className="skeleton h-4 w-4/5" />
                            <div className="skeleton h-4 w-full" />
                            <div className="skeleton h-4 w-3/4" />
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
            // Handle Audify specially - play inline without opening panel
            if (feature === "audio") {
              handleAudifyToggle();
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

        {/* Podcast Panel - Keep mounted for persistence */}
        {(activeFeature === "podcast" || podcastInitialized) && (
          <div style={{ display: activeFeature === "podcast" ? "block" : "none" }}>
            <PodcastPanel
              topic={activePanel.topic}
              content={activePanel.content}
              onClose={() => setActiveFeature(null)}
              cachedDialogue={cachedPodcastData[activePanel.topic]?.dialogue}
              cachedAudioUrl={cachedPodcastData[activePanel.topic]?.audioUrl}
              onPodcastGenerated={(dialogue, audioUrl) => {
                handlePodcastGenerated(activePanel.topic, dialogue, audioUrl);
              }}
              onPlayingChange={(playing) => {
                setIsPodcastPlaying(playing);
                if (playing) setPodcastInitialized(true);
              }}
            />
          </div>
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
