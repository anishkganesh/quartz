"use client";

import { useState, useEffect, useRef } from "react";
import { X, Copy, Check, Play, Pause, RotateCcw, Volume2 } from "lucide-react";

interface PodcastPanelProps {
  topic: string;
  content: string;
  onClose: () => void;
  cachedDialogue?: DialogueLine[];
  cachedAudioUrl?: string | null;
  onPodcastGenerated?: (dialogue: DialogueLine[], audioUrl: string | null) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}

interface DialogueLine {
  speaker: "Host" | "Guest";
  text: string;
}

export default function PodcastPanel({
  topic,
  content,
  onClose,
  cachedDialogue,
  cachedAudioUrl,
  onPodcastGenerated,
  onPlayingChange,
}: PodcastPanelProps) {
  const [dialogue, setDialogue] = useState<DialogueLine[]>(cachedDialogue || []);
  const [audioUrl, setAudioUrl] = useState<string | null>(cachedAudioUrl || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasGeneratedRef = useRef(false);

  // Generate podcast only if not cached and not already generated
  useEffect(() => {
    if (!cachedDialogue?.length && !dialogue.length && !hasGeneratedRef.current) {
      hasGeneratedRef.current = true;
      generatePodcast();
    }
  }, [cachedDialogue, dialogue.length]);

  // Update local state if cached data changes
  useEffect(() => {
    if (cachedDialogue?.length && !dialogue.length) {
      setDialogue(cachedDialogue);
    }
    if (cachedAudioUrl && !audioUrl) {
      setAudioUrl(cachedAudioUrl);
    }
  }, [cachedDialogue, cachedAudioUrl]);

  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  const generatePodcast = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/podcastify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, content }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate podcast");
      }

      const data = await response.json();
      setDialogue(data.dialogue);
      
      if (data.audioUrl) {
        setAudioUrl(data.audioUrl);
      }
      
      onPodcastGenerated?.(data.dialogue, data.audioUrl || null);
    } catch (err) {
      setError("Failed to generate podcast. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    const text = dialogue
      .map((line) => `${line.speaker}: ${line.text}`)
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const dur = audioRef.current.duration;
    if (dur && !isNaN(dur) && dur > 0) {
      const currentProgress = (audioRef.current.currentTime / dur) * 100;
      setProgress(isNaN(currentProgress) ? 0 : currentProgress);
    }
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    const dur = audioRef.current.duration;
    if (dur && !isNaN(dur)) {
      setDuration(dur);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration || isNaN(duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newProgress = (clickX / rect.width) * 100;
    const newTime = (newProgress / 100) * duration;
    if (!isNaN(newTime)) {
      audioRef.current.currentTime = newTime;
      setProgress(newProgress);
    }
  };

  const handleRestart = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    setProgress(0);
    audioRef.current.play();
    setIsPlaying(true);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const currentTime = duration > 0 ? (progress / 100) * duration : 0;

  return (
    <div className="feature-panel">
      <div className="feature-panel-header">
        <h3 className="feature-panel-title">Podcastify</h3>
        <button onClick={onClose} className="panel-close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="feature-panel-content">
        {isLoading ? (
          <div className="feature-loading">
            <div className="spinner" />
            <p className="feature-loading-text">Generating...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={() => {
                hasGeneratedRef.current = false;
                generatePodcast();
              }}
              className="px-4 py-2 bg-accent text-background rounded-full hover:opacity-90"
            >
              Try Again
            </button>
          </div>
        ) : (
          <>
            {/* Audio Player */}
            {audioUrl && (
              <div className="audio-player mb-4">
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handleEnded}
                />

                <div className="audio-controls">
                  <button onClick={togglePlayPause} className="audio-play-btn">
                    {isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </button>

                  <div className="flex-1">
                    <div
                      className="audio-progress cursor-pointer"
                      onClick={handleSeek}
                    >
                      <div
                        className="audio-progress-bar"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-foreground-muted mt-1">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleRestart}
                    className="p-2 hover:bg-background-tertiary rounded transition-colors"
                    title="Restart"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 mt-3 text-xs text-foreground-muted">
                  <Volume2 className="w-3 h-3" />
                  <span>AI voices: Echo (Host) + Nova (Guest)</span>
                </div>
              </div>
            )}

            {/* Copy Button */}
            {dialogue.length > 0 && (
              <div className="flex justify-end mb-3">
                <button
                  onClick={handleCopy}
                  className="p-2 hover:bg-background-tertiary rounded transition-colors"
                  title="Copy script"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}

            {/* Dialogue Script */}
            {dialogue.length > 0 && (
              <div className="space-y-4">
                {dialogue.map((line, index) => (
                  <div key={index} className="script-line">
                    <span
                      className={`script-speaker ${
                        line.speaker === "Host" ? "text-accent" : "text-foreground-muted"
                      }`}
                    >
                      {line.speaker}:
                    </span>
                    <span className="text-foreground">{line.text}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export type { DialogueLine };
