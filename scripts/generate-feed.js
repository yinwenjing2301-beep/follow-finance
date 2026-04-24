#!/usr/bin/env node

// ============================================================================
// Follow Finance — 生成 Feed
// ============================================================================
// 通过 Nitter RSS（无需 API Key）抓取 sources.json 里的账号推文，
// 输出 feed-x.json 到项目根目录。
//
// 在 GitHub Actions 里每天自动运行，也可以本地手动执行：
//   node generate-feed.js
// ============================================================================

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_PATH = join(__dirname, '..', 'config', 'sources.json');
const OUTPUT_PATH  = join(__dirname, '..', 'feed-x.json');

// Nitter 公共实例，按顺序尝试（任一成功即用）
// 如果某实例挂了，自动换下一个
const NITTER_INSTANCES = [
  'nitter.privacydev.net',
  'nitter.poast.org',
  'nitter.1d4.us',
  'nitter.catsarch.com',
  'nitter.kavin.rocks',
];

// -- RSS 解析工具 ------------------------------------------------------------

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    const titleMatch   = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const descMatch    = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
    const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
    const guidMatch    = item.match(/<guid[^>]*>(.*?)<\/guid>/);

    const guid    = guidMatch?.[1]?.trim() || '';
    const idMatch = guid.match(/\/status\/(\d+)/);
    const id      = idMatch?.[1] || '';
    if (!id) continue;

    // Nitter URL → x.com URL
    const tweetUrl = guid.replace(/^https?:\/\/[^/]+\//, 'https://x.com/');

    // 推文正文：优先用 description（更完整），fallback title
    const rawText = descMatch?.[1] || titleMatch?.[1] || '';
    const text    = stripHtml(rawText);
    if (!text) continue;

    const pubDate = pubDateMatch?.[1] || '';
    items.push({
      id,
      text,
      createdAt: pubDate ? new Date(pubDate).toISOString() : null,
      url: tweetUrl,
      likes: 0,
      retweets: 0,
      replies: 0
    });
  }
  return items;
}

// -- 抓取 Nitter RSS ---------------------------------------------------------

async function fetchNitterRSS(handle) {
  for (const instance of NITTER_INSTANCES) {
    try {
      const url = `https://${instance}/${handle}/rss`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; follow-finance RSS reader)' }
      });
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml.includes('<item>')) continue;
      console.error(`  ✓ @${handle} via ${instance}`);
      return xml;
    } catch (_) {
      // 换下一个实例
    }
  }
  console.error(`  ✗ @${handle} — 所有 Nitter 实例均不可用`);
  return null;
}

// -- 主流程 ------------------------------------------------------------------

async function main() {
  const sources  = JSON.parse(await readFile(SOURCES_PATH, 'utf-8'));
  const accounts = (sources.x_accounts || []).filter(a => a.handle?.trim());

  if (accounts.length === 0) {
    console.error('sources.json 里没有账号，请先填写 handle');
    process.exit(1);
  }

  // 抓最近 48h 的推文（48h 容错时区差异；skill 里可以再过滤到 24h）
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const xData  = [];

  for (const account of accounts) {
    const xml = await fetchNitterRSS(account.handle);
    if (!xml) continue;

    const items  = parseRSS(xml);
    const recent = items
      .filter(t => !t.createdAt || new Date(t.createdAt) > cutoff)
      .slice(0, 15); // 每账号最多 15 条

    xData.push({
      source: 'x',
      name:   account.name || account.handle,
      handle: account.handle,
      bio:    '',
      tweets: recent
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    x: xData
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));
  const total = xData.reduce((s, a) => s + a.tweets.length, 0);
  console.error(`生成完成：${xData.length} 个账号，${total} 条推文 → feed-x.json`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
