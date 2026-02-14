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

    const dir = path.dirname(LOG_PATH);
    await mkdir(dir, { recursive: true });

    const serverTs = new Date().toISOString();
    const remoteIp = getRemoteIp(req);
    const remoteUserAgent = req.headers.get('user-agent') || undefined;

    const lines = events.map((e: unknown) => {
      try {
        const enriched = isRecord(e)
          ? {
              ...e,
              _server: {
                ts: serverTs,
                ip: remoteIp,
                userAgent: remoteUserAgent,
              },
            }
          : {
              ts: serverTs,
              level: 'info',
              message: 'non-object log event',
              data: e,
              _server: {
                ts: serverTs,
                ip: remoteIp,
                userAgent: remoteUserAgent,
              },
            };
        return JSON.stringify(enriched);
      } catch {
        return JSON.stringify({ ts: serverTs, level: 'error', message: 'unserializable log event' });
      }
    }).join('\n') + '\n';

    await appendFile(LOG_PATH, lines, { encoding: 'utf8' });

    // Forward errors to backend healing system
    const recordEvents = events.filter(isRecord) as UnknownRecord[];
    forwardToHealing(recordEvents, remoteIp, remoteUserAgent);

    return NextResponse.json({ ok: true, written: events.length });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to write logs' },
      { status: 500 }
    );
  }
}
