import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Clawx-News-Debate-App/1.0",
  },
});

const FEEDS = [
  {
    id: "reuters-world",
    name: "Reuters World",
    category: "World",
    source: "Reuters",
    url: "https://feeds.reuters.com/Reuters/worldNews",
    accent: "blue",
  },
  {
    id: "reuters-tech",
    name: "Reuters Technology",
    category: "Technology",
    source: "Reuters",
    url: "https://feeds.reuters.com/reuters/technologyNews",
    accent: "violet",
  },
  {
    id: "ap-top",
    name: "Associated Press Top News",
    category: "Top Stories",
    source: "AP",
    url: "https://apnews.com/hub/ap-top-news?output=rss",
    accent: "amber",
  },
  {
    id: "npr-world",
    name: "NPR World",
    category: "World",
    source: "NPR",
    url: "https://feeds.npr.org/1004/rss.xml",
    accent: "emerald",
  },
];

function stripHtml(value = "") {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeText(text = "", maxLength = 420) {
  if (!text) return "No summary available from the feed.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function normalizeItem(feed, item, index) {
  const content = stripHtml(
    item.contentSnippet || item.content || item.summary || item["content:encoded"] || item.description || ""
  );

  const title = stripHtml(item.title || "Untitled article");
  const summary = summarizeText(content || title);

  return {
    id: `${feed.id}-${index}-${Buffer.from(item.link || title).toString("base64").slice(0, 10)}`,
    feedId: feed.id,
    feedName: feed.name,
    source: feed.source,
    category: feed.category,
    accent: feed.accent,
    title,
    link: item.link || "",
    publishedAt: item.isoDate || item.pubDate || null,
    author: item.creator || item.author || null,
    summary,
    content: content || summary,
    image: item.enclosure?.url || item?.itunes?.image || null,
  };
}

export async function fetchNewsArticles() {
  const settled = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
      return (parsed.items || []).slice(0, 8).map((item, index) => normalizeItem(feed, item, index));
    })
  );

  const articles = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  return {
    feeds: FEEDS,
    articles: articles
      .filter((article) => article.title && article.link)
      .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()),
    errors: settled
      .map((result, index) => (result.status === "rejected" ? { feedId: FEEDS[index].id, message: String(result.reason) } : null))
      .filter(Boolean),
  };
}

export function getFeedDefinitions() {
  return FEEDS;
}
