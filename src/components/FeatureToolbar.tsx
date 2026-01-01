"use client";

import {
  Sparkles,
  Video,
  Radio,
  Volume2,
  Film,
  Gamepad2,
  MessageCircle,
} from "lucide-react";
import SpeechToText from "./SpeechToText";

export type FeatureType =
  | "simplify"
  | "tiktok"
  | "podcast"
  | "audio"
  | "video"
  | "quiz"
  | "chat"
  | null;

interface FeatureToolbarProps {
  activeFeature: FeatureType;
  onFeatureClick: (feature: FeatureType) => void;
  onSpeechQuestion?: (question: string) => void;
  onSpeechTopic?: (topic: string) => void;
}

// Features before mic (Simplify, Audify, Chat)
const featuresBeforeMic = [
  {
    id: "simplify" as const,
    icon: Sparkles,
    label: "Simplify",
    disabled: false,
  },
  {
    id: "audio" as const,
    icon: Volume2,
    label: "Audify",
    disabled: false,
  },
  {
    id: "chat" as const,
    icon: MessageCircle,
    label: "Chat",
    disabled: false,
  },
];

// Features after mic (Gamify, Podcastify, TikTokify, Videofy)
const featuresAfterMic = [
  {
    id: "quiz" as const,
    icon: Gamepad2,
    label: "Gamify",
    disabled: false,
  },
  {
    id: "podcast" as const,
    icon: Radio,
    label: "Podcastify",
    disabled: false,
  },
  {
    id: "tiktok" as const,
    icon: Video,
    label: "TikTokify",
    disabled: true,
  },
  {
    id: "video" as const,
    icon: Film,
    label: "Videofy",
    disabled: true,
  },
];

export default function FeatureToolbar({
  activeFeature,
  onFeatureClick,
  onSpeechQuestion,
  onSpeechTopic,
}: FeatureToolbarProps) {
  const renderButton = (feature: typeof featuresBeforeMic[0]) => {
    const Icon = feature.icon;
    const isActive = activeFeature === feature.id;

    return (
      <button
        key={feature.id}
        onClick={() => !feature.disabled && onFeatureClick(isActive ? null : feature.id)}
        className={`toolbar-btn ${isActive ? "active" : ""} ${feature.disabled ? "disabled" : ""}`}
        aria-label={feature.label}
        disabled={feature.disabled}
      >
        <Icon className="w-4 h-4" />
      </button>
    );
  };

  return (
    <div className="feature-toolbar">
      {/* Simplify, Audify, Chat */}
      {featuresBeforeMic.map(renderButton)}
      
      {/* Speech-to-Text Mic Button (after Chat) */}
      {onSpeechQuestion && onSpeechTopic && (
        <SpeechToText
          onQuestion={onSpeechQuestion}
          onTopic={onSpeechTopic}
        />
      )}
      
      {/* Gamify, Podcastify, TikTokify, Videofy */}
      {featuresAfterMic.map(renderButton)}
    </div>
  );
}
