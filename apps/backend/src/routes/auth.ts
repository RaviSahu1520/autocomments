import type { FastifyInstance } from 'fastify';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { layout } from '../utils/html.js';

export const COOKIE_NAME = 'autocomments_session';

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const sessions = new Map<string, number>();

function getSessionTtlSeconds(): number {
    const raw = Number(process.env.SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS);
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_SESSION_TTL_SECONDS;
    return Math.floor(raw);
}

function safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
}

function cleanupExpiredSessions(now = Date.now()): void {
    for (const [token, expiresAt] of sessions.entries()) {
        if (expiresAt <= now) sessions.delete(token);
    }
}

export function createSessionToken(): string {
    cleanupExpiredSessions();
    const ttlMs = getSessionTtlSeconds() * 1000;
    const token = randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + ttlMs);
    return token;
}

export function isSessionTokenValid(token?: string): boolean {
    if (!token) return false;
    const expiresAt = sessions.get(token);
    if (!expiresAt) return false;
    if (expiresAt <= Date.now()) {
        sessions.delete(token);
        return false;
    }
    return true;
}

export function revokeSessionToken(token?: string): void {
    if (!token) return;
    sessions.delete(token);
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

    // Login page
    app.get('/login', async (_req, reply) => {
        const html = `
      <div class="login-container">
        <div class="login-card">
          <h1>AutoComments</h1>
          <p class="subtitle">Community Lead Capture and Reply Assistant</p>
          <form method="POST" action="/login">
            <div class="form-group">
              <label for="password">Admin Password</label>
              <input type="password" name="password" id="password" placeholder="Enter password" required autofocus>
            </div>
            <button type="submit" class="btn btn-primary btn-full">Sign In</button>
          </form>
        </div>
      </div>
    `;
        reply.type('text/html').send(layout('Login', html));
    });

    // Login handler
    app.post('/login', async (req, reply) => {
        const body = req.body as { password?: string };
        const providedPassword = body.password || '';
        if (providedPassword && safeEqual(providedPassword, adminPassword)) {
            const sessionToken = createSessionToken();
            reply.setCookie(COOKIE_NAME, sessionToken, {
                path: '/',
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                maxAge: getSessionTtlSeconds(),
            });
            reply.redirect('/opportunities?status=pending');
            return;
        }

        const html = `
      <div class="login-container">
        <div class="login-card">
          <h1>AutoComments</h1>
          <div class="alert alert-danger">Invalid password</div>
          <form method="POST" action="/login">
            <div class="form-group">
              <label for="password">Admin Password</label>
              <input type="password" name="password" id="password" placeholder="Enter password" required autofocus>
            </div>
            <button type="submit" class="btn btn-primary btn-full">Sign In</button>
          </form>
        </div>
      </div>
    `;
        reply.type('text/html').send(layout('Login', html));
    });

    // Logout
    app.get('/logout', async (req, reply) => {
        const sessionToken = (req.cookies as Record<string, string> | undefined)?.[COOKIE_NAME];
        revokeSessionToken(sessionToken);
        reply.clearCookie(COOKIE_NAME, { path: '/' });
        reply.redirect('/login');
    });
}
