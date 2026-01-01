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

const features = [
  {
    id: "simplify" as const,
    icon: Sparkles,
    label: "Simplify",
    description: "Make it simpler",
    disabled: false,
  },
  {
    id: "tiktok" as const,
    icon: Video,
    label: "TikTokify",
    description: "Short-form script",
    disabled: true,
  },
  {
    id: "podcast" as const,
    icon: Radio,
    label: "Podcastify",
    description: "Conversation script",
    disabled: false,
  },
  {
    id: "audio" as const,
    icon: Volume2,
    label: "Audify",
    description: "Listen to article",
    disabled: false,
  },
  {
    id: "video" as const,
    icon: Film,
    label: "Videofy",
    description: "Video script",
    disabled: true,
  },
  {
    id: "quiz" as const,
    icon: Gamepad2,
    label: "Gamify",
    description: "Take a quiz",
    disabled: false,
  },
  {
    id: "chat" as const,
    icon: MessageCircle,
    label: "Chat",
    description: "Ask questions",
    disabled: false,
  },
];

export default function FeatureToolbar({
  activeFeature,
  onFeatureClick,
  onSpeechQuestion,
  onSpeechTopic,
}: FeatureToolbarProps) {
  return (
    <div className="feature-toolbar">
      {features.map((feature) => {
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
      })}
      
      {/* Speech-to-Text Button */}
      {onSpeechQuestion && onSpeechTopic && (
        <SpeechToText
          onQuestion={onSpeechQuestion}
          onTopic={onSpeechTopic}
        />
      )}
    </div>
  );
}
