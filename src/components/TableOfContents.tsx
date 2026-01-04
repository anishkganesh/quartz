"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { toTitleCase } from "@/lib/utils";

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

interface TocSection {
  id: string;
  text: string;
  subsections: TocItem[];
}

interface TableOfContentsProps {
  content: string;
  activeSection?: string;
  onSectionClick: (id: string) => void;
  onActiveChange?: (id: string) => void;
}

export default function TableOfContents({
  content,
  activeSection,
  onSectionClick,
  onActiveChange,
}: TableOfContentsProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Extract headings and organize into sections with subsections
  const { sections, allItems } = useMemo(() => {
    const items: TocItem[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Match ## and ### headings
      const h2Match = trimmed.match(/^##\s+(.+)$/);
      const h3Match = trimmed.match(/^###\s+(.+)$/);

      if (h2Match) {
        const text = h2Match[1].replace(/\[\[|\]\]|\*/g, "");
        const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        items.push({ id, text, level: 2 });
      } else if (h3Match) {
        const text = h3Match[1].replace(/\[\[|\]\]|\*/g, "");
        const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        items.push({ id, text, level: 3 });
      }
    }

    // Organize into sections (h2) with their subsections (h3)
    const organizedSections: TocSection[] = [];
    let currentSection: TocSection | null = null;

    for (const item of items) {
      if (item.level === 2) {
        currentSection = {
          id: item.id,
          text: item.text,
          subsections: [],
        };
        organizedSections.push(currentSection);
      } else if (item.level === 3 && currentSection) {
        currentSection.subsections.push(item);
      }
    }

    return { sections: organizedSections, allItems: items };
  }, [content]);

  // Determine which section is active (for expansion)
  const activeSectionParent = useMemo(() => {
    if (!activeSection) return null;
    
    // Check if activeSection is a h2 section itself
    const isH2 = sections.find(s => s.id === activeSection);
    if (isH2) return activeSection;
    
    // Find parent h2 of an h3 subsection
    for (const section of sections) {
      if (section.subsections.some(sub => sub.id === activeSection)) {
        return section.id;
      }
    }
    
    return null;
  }, [activeSection, sections]);

  // IntersectionObserver for scroll-based highlighting
  useEffect(() => {
    if (allItems.length === 0) return;

    const headingIds = allItems.map((item) => item.id);
    const headingElements: Element[] = [];

    // Find all heading elements
    headingIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) headingElements.push(el);
    });

    if (headingElements.length === 0) return;

    const observerOptions: IntersectionObserverInit = {
      root: null,
      rootMargin: "-80px 0px -70% 0px",
      threshold: 0,
    };

    const handleIntersect: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute("id");
          if (id && onActiveChange) {
            onActiveChange(id);
          }
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersect, observerOptions);

    headingElements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [allItems, onActiveChange]);

  if (sections.length === 0) {
    return null;
  }

  return (
    <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        {!isCollapsed && <span className="sidebar-title">Contents</span>}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="sidebar-toggle"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {!isCollapsed && (
        <nav>
          <ul className="toc-list">
            {sections.map((section) => {
              const isExpanded = activeSectionParent === section.id;
              const isSectionActive = activeSection === section.id;
              
              return (
                <li key={section.id} className={`toc-section ${isExpanded ? 'expanded' : ''}`}>
                  {/* H2 Section */}
                  <div
                    className={`toc-item ${isSectionActive ? 'active' : ''}`}
                    onClick={() => onSectionClick(section.id)}
                  >
                    <span className="toc-dot" />
                    <span>{toTitleCase(section.text)}</span>
                  </div>
                  
                  {/* H3 Subsections - always rendered for animation, visibility controlled by CSS */}
                  {section.subsections.length > 0 && (
                    <ul className="toc-subsections">
                      {section.subsections.map((sub) => {
                        const isSubActive = activeSection === sub.id;
                        
                        return (
                          <li
                            key={sub.id}
                            className={`toc-item level-3 ${isSubActive ? 'active' : ''}`}
                            onClick={() => onSectionClick(sub.id)}
                          >
                            <span className="toc-dot" />
                            <span>{toTitleCase(sub.text)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {isCollapsed && (
        <div className="flex justify-center pt-2">
          <List className="w-4 h-4 text-foreground-muted" />
        </div>
      )}
    </aside>
  );
}
