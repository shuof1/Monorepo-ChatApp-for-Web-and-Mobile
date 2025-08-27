/*
 * adapter-http-web/src/handlers.ts
 * ------------------------------------------------------------
 * Framework-agnostic HTTP handlers for SoR over REST.
 *
 * You can wrap these in Next.js Route Handlers, Express, Hono, etc.
 * Only dependency is the runtime-agnostic @repo/sor-core.
 */

import type { ChatEvent, Millis } from "sor-core";
import { validateWireEventShape, normalizeWireEvent } from "sor-core";
import type { SorDeps } from "sor-core";
import { appendEvent, listEvents, ValidationError, PermissionError, ConflictError, SorError } from "sor-core";

/** ---------------- types ---------------- */
export interface HandlerResult<T = any> {
  status: number;
  json: T;
  headers?: Record<string, string>;
}

export interface AppendRequest {
  /** Authenticated user id extracted by your framework (cookie/header/JWT). */
  userId: string | undefined;
  /** The event JSON from client. */
  body: unknown;
  /** Optional: when true, we require body.authorId === userId (default: true). */
  enforceAuthorMatch?: boolean;
}

export interface ListRequest {
  /** Authenticated user id extracted by your framework */
  userId: string | undefined;
  chatId: string | undefined;
  afterServerSeq?: string | number | undefined;
  limit?: string | number | undefined;
}

/** ---------------- utils ---------------- */
function ok<T>(json: T, status = 200): HandlerResult<T> { return { status, json }; }
function err<T = { error: string; code?: string }>(status: number, code: string, message: string): HandlerResult<T> {
  return { status, json: { error: message, code } as any };
}

function toInt(v: string | number | undefined, def: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : (v ? parseInt(v, 10) : NaN);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

/** Map domain errors to HTTP */
function mapError(e: unknown): HandlerResult {
  if (e instanceof PermissionError) return err(403, e.code, e.message);
  if (e instanceof ValidationError) return err(400, e.code, e.message);
  if (e instanceof ConflictError) return err(409, e.code, e.message);
  if (e instanceof SorError) return err(e.status || 400, e.code, e.message);
  return err(500, "INTERNAL", (e as any)?.message ?? "Internal error");
}

/** ---------------- handlers ---------------- */
export async function handleAppend(sor: SorDeps, req: AppendRequest): Promise<HandlerResult> {
  try {
    if (!req.userId) return err(401, "UNAUTHENTICATED", "Missing userId");
    // 1) shape check & normalize
    validateWireEventShape(req.body);
    const ev = normalizeWireEvent(req.body as ChatEvent);

    // 2) optional: prevent spoofing authorId
    const enforce = req.enforceAuthorMatch ?? true;
    if (enforce && ev.authorId !== req.userId) {
      return err(403, "AUTHOR_MISMATCH", "authorId must match authenticated user");
    }

    // 3) append via SoR
    const res = await appendEvent(sor, ev);
    return ok(res, res.deduped ? 200 : 201);
  } catch (e) {
    return mapError(e);
  }
}

export async function handleList(sor: SorDeps, req: ListRequest): Promise<HandlerResult> {
  try {
    if (!req.userId) return err(401, "UNAUTHENTICATED", "Missing userId");
    const chatId = (req.chatId ?? "").toString().trim();
    if (!chatId) return err(400, "BAD_REQUEST", "chatId is required");

    const after = toInt(req.afterServerSeq, 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = toInt(req.limit, 200, 1, 500);

    const res = await listEvents(sor, { userId: req.userId, chatId, afterServerSeq: after, limit });
    return ok(res, 200);
  } catch (e) {
    return mapError(e);
  }
}

/** ---------------- convenience: factory to bind auth & options ---------------- */
export function makeHandlers(params: { sor: SorDeps; getUserId: () => string | undefined; enforceAuthorMatch?: boolean }) {
  const { sor, getUserId, enforceAuthorMatch } = params;
  return {
    append: (body: unknown) => handleAppend(sor, { userId: getUserId(), body, enforceAuthorMatch }),
    list: (q: { chatId?: string; afterServerSeq?: string | number; limit?: string | number }) =>
      handleList(sor, { userId: getUserId(), chatId: q.chatId, afterServerSeq: q.afterServerSeq, limit: q.limit }),
  };
}

/**
 * Example (Next.js Route Handlers):
 *
 * // apps/web/app/api/events/route.ts
 * export const runtime = 'nodejs';
 * import { NextRequest, NextResponse } from 'next/server';
 * import { createLocalSor } from '@repo/sor-core/sor';
 * import { makeHandlers } from 'adapter-http-web/src/handlers';
 *
 * const sor = createLocalSor(); // or inject Firestore-backed store via overrides
 *
 * function getUserId(req: NextRequest) {
 *   // e.g., from cookies/headers after verifying session
 *   return req.headers.get('x-user-id') ?? undefined;
 * }
 *
 * export async function POST(req: NextRequest) {
 *   const { append } = makeHandlers({ sor, getUserId: () => getUserId(req) });
 *   const body = await req.json();
 *   const res = await append(body);
 *   return NextResponse.json(res.json, { status: res.status, headers: res.headers });
 * }
 *
 * export async function GET(req: NextRequest) {
 *   const { list } = makeHandlers({ sor, getUserId: () => getUserId(req) });
 *   const { searchParams } = new URL(req.url);
 *   const res = await list({
 *     chatId: searchParams.get('chatId') ?? undefined,
 *     afterServerSeq: searchParams.get('after') ?? undefined,
 *     limit: searchParams.get('limit') ?? undefined,
 *   });
 *   return NextResponse.json(res.json, { status: res.status, headers: res.headers });
 * }
 */
