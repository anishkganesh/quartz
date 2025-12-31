"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { X } from "lucide-react";
import ArticleHeader from "@/components/ArticleHeader";
import TableOfContents from "@/components/TableOfContents";
import FeatureToolbar, { FeatureType } from "@/components/FeatureToolbar";
import WikiContent from "@/components/WikiContent";
import SimplifyPanel from "@/components/SimplifyPanel";
import TikTokPanel from "@/components/TikTokPanel";
import PodcastPanel, { DialogueLine } from "@/components/PodcastPanel";
import AudioPlayer from "@/components/AudioPlayer";
import VideoPanel from "@/components/VideoPanel";
import QuizPanel, { Question } from "@/components/QuizPanel";
import ChatPanel from "@/components/ChatPanel";
import TextSelectionPopup from "@/components/TextSelectionPopup";
import RelatedQuestions from "@/components/RelatedQuestions";
import { BreadcrumbItem } from "@/components/Breadcrumbs";
import { getFromCache, saveToCache, addRecentTopic } from "@/lib/cache";
import { toTitleCase } from "@/lib/utils";

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
  const [error, setError] = useState<string | null>(null);

  // Feature panel state
  const [activeFeature, setActiveFeature] = useState<FeatureType>(null);
  const [_isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [_isPodcastPlaying, setIsPodcastPlaying] = useState(false);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [podcastInitialized, setPodcastInitialized] = useState(false);

  // Cached audio/podcast/quiz/video data - keyed by topic
  const [cachedAudioUrls, setCachedAudioUrls] = useState<Record<string, string>>({});
  const [cachedPodcastData, setCachedPodcastData] = useState<Record<string, { dialogue: DialogueLine[], audioUrl: string | null }>>({});
  const [cachedQuizData, setCachedQuizData] = useState<Record<string, Question[]>>({});
  const [cachedTikTokScript, setCachedTikTokScript] = useState<Record<string, string>>({});
  const [cachedVideoScript, setCachedVideoScript] = useState<Record<string, string>>({});

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
    setError(null);

    // Check cache
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
      // Trigger background pre-generation
      preGenerateContent(topic, cached.content);
      return;
    }

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });

      if (!response.ok) throw new Error("Failed to generate");

      const data = await response.json();
      saveToCache(topic, data.content);

      setPanelStack((prev) => {
        const updated = [...prev];
        updated[panelIndex] = {
          ...updated[panelIndex],
          content: data.content,
          simplifiedContents: { 1: data.content },
        };
        return updated;
      });
      
      // Trigger background pre-generation
      preGenerateContent(topic, data.content);
    } catch (err) {
      setError("Failed to load article");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

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
    
    // Load content for new panel
    setTimeout(() => {
      loadContent(formattedTopic, panelStack.length);
    }, 0);

    addRecentTopic(concept);
  }, [panelStack.length]);

  // Handle breadcrumb navigation
  const handleBreadcrumbNavigate = useCallback((index: number) => {
    setPanelStack((prev) => prev.slice(0, index + 1));
  }, []);

  // Handle panel close
  const handleClosePanel = useCallback((index: number) => {
    setPanelStack((prev) => prev.slice(0, index));
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

  // Handle audio generation callback
  const handleAudioGenerated = useCallback((topic: string, url: string) => {
    setCachedAudioUrls(prev => ({ ...prev, [topic]: url }));
  }, []);

  // Handle podcast generation callback
  const handlePodcastGenerated = useCallback((topic: string, dialogue: DialogueLine[], audioUrl: string | null) => {
    setCachedPodcastData(prev => ({ ...prev, [topic]: { dialogue, audioUrl } }));
  }, []);

  // Handle quiz generation callback
  const handleQuizGenerated = useCallback((topic: string, questions: Question[]) => {
    setCachedQuizData(prev => ({ ...prev, [topic]: questions }));
  }, []);

  // Background pre-generation for fast tools (Audify, Gamify, TikTokify, Videofy)
  const preGenerateContent = useCallback(async (topic: string, content: string) => {
    // Skip if no content
    if (!content) return;

    // Pre-generate Audify in background (if not already cached)
    if (!cachedAudioUrls[topic]) {
      fetch("/api/audify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, content }),
      })
        .then(res => res.blob())
        .then(blob => {
          const url = URL.createObjectURL(blob);
          setCachedAudioUrls(prev => ({ ...prev, [topic]: url }));
        })
        .catch(err => console.error("Background audify error:", err));
    }

    // Pre-generate Gamify quiz in background (if not already cached)
    if (!cachedQuizData[topic]) {
      fetch("/api/gamify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, content }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.questions) {
            setCachedQuizData(prev => ({ ...prev, [topic]: data.questions }));
          }
        })
        .catch(err => console.error("Background gamify error:", err));
    }

    // Pre-generate TikTokify in background (if not already cached)
    if (!cachedTikTokScript[topic]) {
      fetch("/api/tiktokify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, content }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.script) {
            setCachedTikTokScript(prev => ({ ...prev, [topic]: data.script }));
          }
        })
        .catch(err => console.error("Background tiktokify error:", err));
    }

    // Pre-generate Videofy in background (if not already cached)
    if (!cachedVideoScript[topic]) {
      fetch("/api/videofy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, content }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.script) {
            setCachedVideoScript(prev => ({ ...prev, [topic]: data.script }));
          }
        })
        .catch(err => console.error("Background videofy error:", err));
    }
  }, [cachedAudioUrls, cachedQuizData, cachedTikTokScript, cachedVideoScript]);

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
                        {/* Related Questions - only on main panel */}
                        {isLast && panel.content && (
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
          onFeatureClick={setActiveFeature}
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

        {activeFeature === "tiktok" && (
          <TikTokPanel
            topic={activePanel.topic}
            content={activePanel.content}
            onClose={() => setActiveFeature(null)}
            cachedScript={cachedTikTokScript[activePanel.topic]}
            onScriptGenerated={(script) => setCachedTikTokScript(prev => ({ ...prev, [activePanel.topic]: script }))}
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

        {/* Audio Player - Keep mounted for persistence */}
        {(activeFeature === "audio" || audioInitialized) && (
          <div style={{ display: activeFeature === "audio" ? "block" : "none" }}>
            <AudioPlayer
              topic={activePanel.topic}
              content={activePanel.content}
              onClose={() => setActiveFeature(null)}
              cachedAudioUrl={cachedAudioUrls[activePanel.topic]}
              onAudioGenerated={(url) => handleAudioGenerated(activePanel.topic, url)}
              onPlayingChange={(playing) => {
                setIsAudioPlaying(playing);
                if (playing) setAudioInitialized(true);
              }}
            />
          </div>
        )}

        {activeFeature === "video" && (
          <VideoPanel
            topic={activePanel.topic}
            content={activePanel.content}
            onClose={() => setActiveFeature(null)}
            cachedScript={cachedVideoScript[activePanel.topic]}
            onScriptGenerated={(script) => setCachedVideoScript(prev => ({ ...prev, [activePanel.topic]: script }))}
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
      </div>
    </div>
  );
}
