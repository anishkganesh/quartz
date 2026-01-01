"use client";

import { useState, useEffect, RefObject } from "react";
import { X, Copy, Check, Play, Pause } from "lucide-react";

interface DialogueLine {
  speaker: "Host" | "Guest";
  text: string;
}

interface PodcastPanelProps {
  topic: string;
  content: string;
  onClose: () => void;
  cachedDialogue?: DialogueLine[];
  cachedAudioUrl?: string | null;
  onPodcastGenerated?: (dialogue: DialogueLine[], audioUrl: string | null) => void;
  externalAudioRef?: RefObject<HTMLAudioElement | null>;
  isGenerating?: boolean;
  isPlaying?: boolean;
}

export default function PodcastPanel({
  onClose,
  cachedDialogue,
  cachedAudioUrl,
  externalAudioRef,
  isGenerating = false,
  isPlaying: externalIsPlaying = false,
}: PodcastPanelProps) {
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);

  const speedOptions = [0.5, 1, 1.5, 2];
  const audioRef = externalAudioRef;
  const dialogue = cachedDialogue || [];

  // Update progress from external audio element
  useEffect(() => {
    const audio = audioRef?.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const dur = audio.duration;
      if (dur && !isNaN(dur) && dur > 0) {
        const prog = (audio.currentTime / dur) * 100;
        setProgress(isNaN(prog) ? 0 : prog);
        setCurrentTime(audio.currentTime);
      }
    };

    const handleLoadedMetadata = () => {
      const dur = audio.duration;
      if (dur && !isNaN(dur)) {
        setDuration(dur);
      }
    };

    const handleEnded = () => {
      setProgress(0);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    // Initialize duration if audio is already loaded
    if (audio.duration && !isNaN(audio.duration)) {
      setDuration(audio.duration);
    }

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioRef, cachedAudioUrl]);

  const handleCopy = async () => {
    const text = dialogue
      .map((line) => `${line.speaker}: ${line.text}`)
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const togglePlayPause = () => {
    const audio = audioRef?.current;
    if (!audio || !cachedAudioUrl) return;

    if (externalIsPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef?.current;
    if (!audio || !duration || isNaN(duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newProgress = (clickX / rect.width) * 100;
    const newTime = (newProgress / 100) * duration;
    if (!isNaN(newTime)) {
      audio.currentTime = newTime;
      setProgress(newProgress);
      setCurrentTime(newTime);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    const audio = audioRef?.current;
    if (audio) {
      audio.playbackRate = speed;
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="feature-panel">
      <div className="feature-panel-header">
        <h3 className="feature-panel-title">Podify</h3>
        <button onClick={onClose} className="panel-close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="feature-panel-content">
        {isGenerating && !cachedAudioUrl ? (
          <div className="feature-loading">
            <div className="spinner" />
            <p className="feature-loading-text">Generating podcast...</p>
          </div>
        ) : (
          <>
            {/* Audio Player - Minimal */}
            {cachedAudioUrl && (
              <div className="audio-player-minimal mb-4">
                <div className="audio-controls-row">
                  <button onClick={togglePlayPause} className="audio-play-btn-minimal">
                    {externalIsPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </button>

                  <div className="audio-progress-wrapper">
                    <div
                      className="audio-progress-minimal cursor-pointer"
                      onClick={handleSeek}
                    >
                      <div
                        className="audio-progress-bar-minimal"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <span className="audio-time">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>

                  {/* Speed controls */}
                  <div className="audio-speed-controls">
                    {speedOptions.map((speed) => (
                      <button
                        key={speed}
                        onClick={() => handleSpeedChange(speed)}
                        className={`audio-speed-btn ${playbackSpeed === speed ? "active" : ""}`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
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

            {/* Show message if no content yet */}
            {!cachedAudioUrl && dialogue.length === 0 && !isGenerating && (
              <div className="feature-loading">
                <p className="feature-loading-text">Click to generate podcast</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export type { DialogueLine };
