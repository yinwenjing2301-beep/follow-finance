#!/usr/bin/env node

// ============================================================================
// Follow Finance — Prepare Digest
// ============================================================================
// 从 GitHub 上的 feed-x.json（由 generate-feed.js 自动生成）拉取推文数据，
// 结合本地 prompts 和用户配置，输出一个 JSON blob 给 LLM 使用。
//
// 不需要任何 API Key。
//
// 用法：node prepare-digest.js
// 输出：JSON 到 stdout
// ============================================================================

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const USER_DIR    = join(homedir(), '.follow-finance');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const ENV_PATH    = join(USER_DIR, '.env');
const SOURCES_PATH = join(__dirname, '..', 'config', 'sources.json');
const PROMPTS_DIR  = join(__dirname, '..', 'prompts');
const USER_PROMPTS = join(USER_DIR, 'prompts');

const PROMPT_FILES = ['summarize-tweets.md', 'digest-intro.md', 'translate.md'];

// -- Fetch helpers -----------------------------------------------------------

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

// -- 主流程 ------------------------------------------------------------------

async function main() {
  loadEnv({ path: ENV_PATH });

  const errors = [];

  // 1. 读取用户配置
  let config = {
    language: 'zh',
    frequency: 'daily',
    delivery: { method: 'stdout' }
  };
  if (existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    } catch (err) {
      errors.push(`无法读取配置：${err.message}`);
    }
  }

  // 2. 读取 sources.json，获取 feed_url
  let sources = {};
  if (existsSync(SOURCES_PATH)) {
    try {
      sources = JSON.parse(await readFile(SOURCES_PATH, 'utf-8'));
    } catch (err) {
      errors.push(`无法读取 sources.json：${err.message}`);
    }
  }

  const feedUrl = sources.feed_url;
  if (!feedUrl || feedUrl.includes('YOUR_GITHUB_USERNAME')) {
    errors.push('请在 config/sources.json 里填写 feed_url（你的 GitHub raw URL）');
  }

  // 3. 拉取 feed-x.json
  let feedX = null;
  if (feedUrl && !feedUrl.includes('YOUR_GITHUB_USERNAME')) {
    try {
      feedX = await fetchJSON(feedUrl);
    } catch (err) {
      errors.push(`无法获取 feed：${err.message}。请确认 GitHub Actions 已运行过一次。`);
    }
  }

  // 4. 加载提示词（优先用户自定义 > 本地默认）
  const prompts = {};
  for (const filename of PROMPT_FILES) {
    const key       = filename.replace('.md', '').replace(/-/g, '_');
    const userPath  = join(USER_PROMPTS, filename);
    const localPath = join(PROMPTS_DIR, filename);
    if (existsSync(userPath)) {
      prompts[key] = await readFile(userPath, 'utf-8');
    } else if (existsSync(localPath)) {
      prompts[key] = await readFile(localPath, 'utf-8');
    } else {
      errors.push(`缺少提示词文件：${filename}`);
    }
  }

  // 5. 组装输出
  const xData = feedX?.x || [];
  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    config: {
      language: config.language || 'zh',
      frequency: config.frequency || 'daily',
      delivery: config.delivery || { method: 'stdout' }
    },
    x: xData,
    stats: {
      xAccounts: xData.length,
      totalTweets: xData.reduce((sum, a) => sum + a.tweets.length, 0),
      feedGeneratedAt: feedX?.generatedAt || null
    },
    prompts,
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
});
