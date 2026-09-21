/**
 * HTTP helpers for Supabase CLI tooling — native fetch, no SDK.
 */

import { isOpaqueKey } from './config.mjs';

const DEFAULT_TIMEOUT_MS = 10000;

export function buildHeaders(key, extra = {}) {
  const headers = { apikey: key, Accept: 'application/json', ...extra };
  if (!isOpaqueKey(key)) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export async function restGet(url, key, path, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method: 'GET',
      headers: buildHeaders(key),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function restPost(url, key, path, body, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method: 'POST',
      headers: buildHeaders(key, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function functionPost(url, key, fnName, body, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: buildHeaders(key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}
