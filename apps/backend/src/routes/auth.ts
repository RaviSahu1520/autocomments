import type { FastifyInstance } from 'fastify';
import { layout } from '../utils/html.js';

const COOKIE_NAME = 'autocomments_session';
const SESSION_VALUE = 'authenticated';

export async function authRoutes(app: FastifyInstance): Promise<void> {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

    // Auth check hook for all routes except login, static files, tracking, and API
    app.addHook('onRequest', async (req, reply) => {
        const path = req.url.split('?')[0];
        const publicPaths = ['/login', '/t', '/api/events/conversion', '/api/discord/opportunity'];
        const isPublic = publicPaths.some(p => path.startsWith(p));
        const isStatic = path.startsWith('/styles.css') || path.startsWith('/app.js') || path.startsWith('/favicon');

        if (isPublic || isStatic) return;

        const session = (req.cookies as Record<string, string>)?.[COOKIE_NAME];
        if (session !== SESSION_VALUE) {
            reply.redirect('/login');
        }
    });

    // Login page
    app.get('/login', async (_req, reply) => {
        const html = `
      <div class="login-container">
        <div class="login-card">
          <h1>🏠 AutoComments</h1>
          <p class="subtitle">Community Lead Capture & Reply Assistant</p>
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
        if (body.password === adminPassword) {
            reply.setCookie(COOKIE_NAME, SESSION_VALUE, {
                path: '/',
                httpOnly: true,
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 7, // 7 days
            });
            reply.redirect('/opportunities?status=pending');
        } else {
            const html = `
        <div class="login-container">
          <div class="login-card">
            <h1>🏠 AutoComments</h1>
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
        }
    });

    // Logout
    app.get('/logout', async (_req, reply) => {
        reply.clearCookie(COOKIE_NAME, { path: '/' });
        reply.redirect('/login');
    });
}
