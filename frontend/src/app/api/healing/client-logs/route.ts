/**
 * API Route: /api/healing/client-logs
 * 
 * Proxies client-side logs to the backend healing system.
 * This handles both single logs and batch logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

const LOG_PATH = process.env.CLIENT_LOG_PATH || '/tmp/mangwale-client.log';
const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3200';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const getRemoteIp = (req: NextRequest): string | undefined => {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || undefined;
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.trim() || undefined;
  return undefined;
};

// Forward error logs to backend healing system
async function forwardToHealing(events: UnknownRecord[], remoteIp?: string, userAgent?: string): Promise<void> {
  try {
    // Only forward errors
    const errors = events.filter((e) => e.level === 'error' || e.level === 'warn');
    if (errors.length === 0) return;

    const batchPayload = {
      logs: errors.map((e) => ({
        level: e.level as string,
        message: typeof e.message === 'string' ? e.message : JSON.stringify(e.message),
        context: e.context as string | undefined,
        timestamp: e.ts as string | undefined,
        stack: e.stack as string | undefined,
        url: e.url as string | undefined,
        userAgent,
        metadata: {
          ...e,
          remoteIp,
        },
      })),
    };

    // Fire and forget - don't block on backend
    fetch(`${BACKEND_URL}/api/healing/client-logs/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchPayload),
    }).catch(() => {
      // Silently ignore backend errors
    });
  } catch {
    // Silently ignore forwarding errors
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const events = Array.isArray(body?.events) ? body.events : body ? [body] : [];

    if (!events.length) {
      return NextResponse.json({ ok: true, written: 0 });
    }

    const remoteIp = getRemoteIp(req);
    const userAgent = req.headers.get('user-agent') || undefined;

    // Write to local file
    const lines = events.map((e: UnknownRecord) => {
      const ts = typeof e.ts === 'string' ? e.ts : new Date().toISOString();
      const level = typeof e.level === 'string' ? e.level.toUpperCase() : 'INFO';
      const msg = typeof e.message === 'string' ? e.message : JSON.stringify(e);
      return `[${ts}] [${level}] ${msg}`;
    });

    try {
      await mkdir(path.dirname(LOG_PATH), { recursive: true });
      await appendFile(LOG_PATH, lines.join('\n') + '\n');
    } catch {
      // Silently ignore file write errors in production
    }

    // Forward errors to backend healing system
    forwardToHealing(events, remoteIp, userAgent);

    return NextResponse.json({ ok: true, written: lines.length });
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }
}
