import { MetadataRoute } from "next";

// Popular topics that are likely to be searched
const POPULAR_TOPICS = [
  "Quantum_Mechanics",
  "Artificial_Intelligence",
  "Machine_Learning",
  "Neural_Networks",
  "Black_Holes",
  "Theory_of_Relativity",
  "Climate_Change",
  "Photosynthesis",
  "DNA",
  "Evolution",
  "Blockchain",
  "Cryptocurrency",
  "Philosophy",
  "Psychology",
  "Economics",
  "World_War_II",
  "Renaissance",
  "Ancient_Rome",
  "Computer_Science",
  "Mathematics",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://tryquartz.wiki";

  // Home page
  const routes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];

  // Add popular topic pages
  const topicRoutes: MetadataRoute.Sitemap = POPULAR_TOPICS.map((topic) => ({
    url: `${baseUrl}/page/${topic}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...routes, ...topicRoutes];
}


