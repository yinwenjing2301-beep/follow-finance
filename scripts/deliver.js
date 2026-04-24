#!/usr/bin/env node

// ============================================================================
// Follow Finance — 发送脚本
// ============================================================================
// 将摘要通过用户选择的方式发送：Telegram、邮件（Resend）或直接输出。
//
// 用法：
//   echo "摘要内容" | node deliver.js
//   node deliver.js --message "摘要内容"
//   node deliver.js --file /path/to/digest.txt
//
// 配置读取自 ~/.follow-finance/config.json
// API Key 读取自 ~/.follow-finance/.env
// ============================================================================

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { config as loadEnv } from 'dotenv';

const USER_DIR    = join(homedir(), '.follow-finance');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const ENV_PATH    = join(USER_DIR, '.env');

// -- 读取输入 ----------------------------------------------------------------

async function getDigestText() {
  const args = process.argv.slice(2);

  const msgIdx = args.indexOf('--message');
  if (msgIdx !== -1 && args[msgIdx + 1]) return args[msgIdx + 1];

  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) return readFile(args[fileIdx + 1], 'utf-8');

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

// -- Telegram ----------------------------------------------------------------

async function sendTelegram(text, botToken, chatId) {
  const MAX_LEN = 4000;
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) { chunks.push(remaining); break; }
    let splitAt = remaining.lastIndexOf('\n', MAX_LEN);
    if (splitAt < MAX_LEN * 0.5) splitAt = MAX_LEN;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
    if (!res.ok) {
      const err = await res.json();
      if (err.description?.includes("can't parse")) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true })
        });
      } else {
        throw new Error(`Telegram API 错误：${err.description}`);
      }
    }
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
  }
}

// -- Email (Resend) ----------------------------------------------------------

async function sendEmail(text, apiKey, toEmail) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from: '财经日报 <digest@resend.dev>',
      to: [toEmail],
      subject: `财经日报 — ${new Date().toLocaleDateString('zh-CN', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
      })}`,
      text
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend API 错误：${err.message || JSON.stringify(err)}`);
  }
}

// -- 主流程 ------------------------------------------------------------------

async function main() {
  loadEnv({ path: ENV_PATH });

  let config = {};
  if (existsSync(CONFIG_PATH)) {
    config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
  }

  const delivery    = config.delivery || { method: 'stdout' };
  const digestText  = await getDigestText();

  if (!digestText?.trim()) {
    console.log(JSON.stringify({ status: 'skipped', reason: '摘要内容为空' }));
    return;
  }

  try {
    switch (delivery.method) {
      case 'telegram': {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId   = delivery.chatId;
        if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN 未在 .env 中配置');
        if (!chatId)   throw new Error('delivery.chatId 未在 config.json 中配置');
        await sendTelegram(digestText, botToken, chatId);
        console.log(JSON.stringify({ status: 'ok', method: 'telegram', message: '已发送到 Telegram' }));
        break;
      }
      case 'email': {
        const apiKey  = process.env.RESEND_API_KEY;
        const toEmail = delivery.email;
        if (!apiKey)  throw new Error('RESEND_API_KEY 未在 .env 中配置');
        if (!toEmail) throw new Error('delivery.email 未在 config.json 中配置');
        await sendEmail(digestText, apiKey, toEmail);
        console.log(JSON.stringify({ status: 'ok', method: 'email', message: `已发送到 ${toEmail}` }));
        break;
      }
      case 'stdout':
      default:
        console.log(digestText);
        break;
    }
  } catch (err) {
    console.log(JSON.stringify({ status: 'error', method: delivery.method, message: err.message }));
    process.exit(1);
  }
}

main();
