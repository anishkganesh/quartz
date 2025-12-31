"use client";

import { useState, useRef, useEffect } from "react";
import { X, Play, Pause, RotateCcw, Volume2 } from "lucide-react";

interface AudioPlayerProps {
  topic: string;
  content: string;
  onClose: () => void;
  onPlayingChange?: (isPlaying: boolean) => void;
  cachedAudioUrl?: string | null;
  onAudioGenerated?: (url: string) => void;
}

export default function AudioPlayer({
  topic,
  content,
  onClose,
  onPlayingChange,
  cachedAudioUrl,
  onAudioGenerated,
}: AudioPlayerProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(cachedAudioUrl || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasGeneratedRef = useRef(false);

  // Generate audio only if not cached and not already generated
  useEffect(() => {
    if (!cachedAudioUrl && !audioUrl && !hasGeneratedRef.current) {
      hasGeneratedRef.current = true;
      generateAudio();
    }
  }, [cachedAudioUrl, audioUrl]);

  // Update local state if cached URL changes
  useEffect(() => {
    if (cachedAudioUrl && !audioUrl) {
      setAudioUrl(cachedAudioUrl);
    }
  }, [cachedAudioUrl]);

  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  const generateAudio = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/audify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, content }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate audio");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      onAudioGenerated?.(url);
    } catch (err) {
      setError("Failed to generate audio. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
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
        <h3 className="feature-panel-title">Audify</h3>
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
                generateAudio();
              }}
              className="px-4 py-2 bg-accent text-background rounded-lg hover:opacity-90"
            >
              Try Again
            </button>
          </div>
        ) : audioUrl ? (
          <div className="audio-player">
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

            <div className="flex items-center gap-2 mt-4 text-sm text-foreground-muted">
              <Volume2 className="w-4 h-4" />
              <span>AI-generated narration</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
