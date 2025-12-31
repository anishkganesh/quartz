"use client";

import { ChevronRight } from "lucide-react";
import { toTitleCase } from "@/lib/utils";

export interface BreadcrumbItem {
  topic: string;
  label: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onNavigate: (index: number) => void;
}

export default function Breadcrumbs({ items, onNavigate }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.topic}-${index}`} className="flex items-center gap-2">
          {index > 0 && (
            <ChevronRight className="w-4 h-4 breadcrumb-separator" />
          )}
          <button
            onClick={() => onNavigate(index)}
            className="breadcrumb-item"
            disabled={index === items.length - 1}
          >
            {toTitleCase(item.label)}
          </button>
        </span>
      ))}
    </nav>
  );
}
