"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface WikiContentProps {
  content: string;
  onConceptClick: (concept: string) => void;
}

// Render LaTeX using KaTeX
function renderLatex(latex: string, displayMode: boolean = false): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch (e) {
    console.error("KaTeX error:", e);
    return latex;
  }
}

// Preprocess content to fix common formatting issues
function preprocessContent(content: string): string {
  // Convert [[math]] to $$math$$ when content looks like LaTeX
  // (contains ^, _, \, {, }, or is a single letter/number formula)
  return content.replace(/\[\[([^\]]+)\]\]/g, (match, inner) => {
    // Check if this looks like math (has LaTeX characters) rather than a concept
    const looksLikeMath = /[\\^_{}]|^\s*[a-zA-Z0-9\s+\-*\/=<>()]+\s*$/.test(inner) &&
      (inner.includes('\\') || inner.includes('^') || inner.includes('_') || 
       inner.includes('{') || /^[a-zA-Z]\s*=/.test(inner));
    
    if (looksLikeMath) {
      return `$$${inner}$$`;
    }
    return match; // Keep as concept
  });
}

function parseMarkdown(
  content: string,
  onConceptClick: (concept: string) => void
): React.ReactNode[] {
  // Preprocess to fix LaTeX in [[]] brackets
  const processedContent = preprocessContent(content);
  const lines = processedContent.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;
  let currentIndex = 1;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      if (listType === "ul") {
        elements.push(
          <ul
            key={`list-${elements.length}`}
            className="list-disc ml-6 my-4 space-y-2"
          >
            {listItems}
          </ul>
        );
      } else {
        elements.push(
          <ol
            key={`list-${elements.length}`}
            className="list-decimal ml-6 my-4 space-y-2"
          >
            {listItems}
          </ol>
        );
      }
      listItems = [];
      listType = null;
      currentIndex = 1;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) {
      flushList();
      continue;
    }

    // Headers - check in order from most # to least
    if (trimmedLine.startsWith("#### ")) {
      flushList();
      const text = trimmedLine.slice(5);
      const id = text
        .toLowerCase()
        .replace(/\[\[|\]\]/g, "")
        .replace(/[^a-z0-9]+/g, "-");
      elements.push(
        <h4 key={`h4-${i}`} id={id} className="scroll-mt-20">
          {renderInlineContent(text, onConceptClick, `h4-${i}`)}
        </h4>
      );
      continue;
    }

    if (trimmedLine.startsWith("### ")) {
      flushList();
      const text = trimmedLine.slice(4);
      const id = text
        .toLowerCase()
        .replace(/\[\[|\]\]/g, "")
        .replace(/[^a-z0-9]+/g, "-");
      elements.push(
        <h3 key={`h3-${i}`} id={id} className="scroll-mt-20">
          {renderInlineContent(text, onConceptClick, `h3-${i}`)}
        </h3>
      );
      continue;
    }

    if (trimmedLine.startsWith("## ")) {
      flushList();
      const text = trimmedLine.slice(3);
      const id = text
        .toLowerCase()
        .replace(/\[\[|\]\]/g, "")
        .replace(/[^a-z0-9]+/g, "-");
      elements.push(
        <h2 key={`h2-${i}`} id={id} className="scroll-mt-20">
          {renderInlineContent(text, onConceptClick, `h2-${i}`)}
        </h2>
      );
      continue;
    }

    // Unordered list items
    if (trimmedLine.startsWith("- ") || trimmedLine.startsWith("* ")) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(
        <li key={`li-${i}`}>
          {renderInlineContent(trimmedLine.slice(2), onConceptClick, `li-${i}`)}
        </li>
      );
      continue;
    }

    // Ordered list items
    const orderedMatch = trimmedLine.match(/^(\d+)\.\s+(.+)/);
    if (orderedMatch) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
        currentIndex = parseInt(orderedMatch[1]);
      }
      listItems.push(
        <li key={`li-${i}`} value={currentIndex++}>
          {renderInlineContent(orderedMatch[2], onConceptClick, `li-${i}`)}
        </li>
      );
      continue;
    }

    // Blockquotes
    if (trimmedLine.startsWith("> ")) {
      flushList();
      elements.push(
        <blockquote key={`bq-${i}`}>
          {renderInlineContent(trimmedLine.slice(2), onConceptClick, `bq-${i}`)}
        </blockquote>
      );
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`}>
        {renderInlineContent(trimmedLine, onConceptClick, `p-${i}`)}
      </p>
    );
  }

  flushList();
  return elements;
}

function renderInlineContent(
  text: string,
  onConceptClick: (concept: string) => void,
  keyPrefix: string
): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let keyIndex = 0;

  // Process the text to handle [[concepts]], **bold**, *italic*, and LaTeX formulas
  // Regex to match [[concept]], **bold**, *italic*, \(...\), $...$, \[...\], or $$...$$
  // Note: **bold** must come before *italic* so double asterisks match first
  const regex = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|\*([^*]+)\*|\\\((.+?)\\\)|\$\$(.+?)\$\$|\\\[(.+?)\\\]|\$([^$]+)\$/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // This is a [[concept]]
      const concept = match[1];
      result.push(
        <span
          key={`${keyPrefix}-concept-${keyIndex++}`}
          className="concept-link"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onConceptClick(concept);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onConceptClick(concept);
            }
          }}
        >
          {concept}
        </span>
      );
    } else if (match[2]) {
      // This is **bold** text - check for concepts inside
      const boldText = match[2];
      const innerContent = renderInlineContent(
        boldText,
        onConceptClick,
        `${keyPrefix}-bold-${keyIndex}`
      );
      result.push(
        <strong key={`${keyPrefix}-bold-${keyIndex++}`}>{innerContent}</strong>
      );
    } else if (match[3]) {
      // This is *italic* text - check for concepts inside
      const italicText = match[3];
      const innerContent = renderInlineContent(
        italicText,
        onConceptClick,
        `${keyPrefix}-italic-${keyIndex}`
      );
      result.push(
        <em key={`${keyPrefix}-italic-${keyIndex++}`}>{innerContent}</em>
      );
    } else if (match[4]) {
      // This is inline LaTeX \(...\)
      result.push(
        <span
          key={`${keyPrefix}-latex-${keyIndex++}`}
          className="latex-inline"
          dangerouslySetInnerHTML={{ __html: renderLatex(match[4], false) }}
        />
      );
    } else if (match[5]) {
      // This is display LaTeX $$...$$
      result.push(
        <span
          key={`${keyPrefix}-latex-${keyIndex++}`}
          className="latex-block"
          dangerouslySetInnerHTML={{ __html: renderLatex(match[5], true) }}
        />
      );
    } else if (match[6]) {
      // This is display LaTeX \[...\]
      result.push(
        <span
          key={`${keyPrefix}-latex-${keyIndex++}`}
          className="latex-block"
          dangerouslySetInnerHTML={{ __html: renderLatex(match[6], true) }}
        />
      );
    } else if (match[7]) {
      // This is inline LaTeX $...$
      result.push(
        <span
          key={`${keyPrefix}-latex-${keyIndex++}`}
          className="latex-inline"
          dangerouslySetInnerHTML={{ __html: renderLatex(match[7], false) }}
        />
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}

export default function WikiContent({
  content,
  onConceptClick,
}: WikiContentProps) {
  const renderedContent = useMemo(
    () => parseMarkdown(content, onConceptClick),
    [content, onConceptClick]
  );

  return <div className="article-content">{renderedContent}</div>;
}
