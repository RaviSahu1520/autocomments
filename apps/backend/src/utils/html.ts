/**
 * Minimal HTML template helper for server-rendered pages.
 * No template engine dependency — just string interpolation.
 */

export function layout(title: string, content: string, extraHead = ''): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} — AutoComments</title>
  <link rel="stylesheet" href="/styles.css">
  ${extraHead}
</head>
<body>
  <nav class="navbar">
    <div class="nav-brand">
      <span class="nav-icon">🏠</span>
      <a href="/opportunities?status=pending">AutoComments</a>
    </div>
    <div class="nav-links">
      <a href="/opportunities?status=pending">Queue</a>
      <a href="/opportunities?status=all">All</a>
      <a href="/quora/submit">+ Quora</a>
      <a href="/instagram">Instagram</a>
      <a href="/exports">Exports</a>
      <a href="/config">Config</a>
      <a href="/reports/weekly">Reports</a>
      <a href="/logout" class="btn-sm btn-outline">Logout</a>
    </div>
  </nav>
  <main class="container">
    ${content}
  </main>
  <script src="/app.js"></script>
</body>
</html>`;
}

export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function badge(status: string): string {
    const colors: Record<string, string> = {
        new: 'badge-info',
        pending: 'badge-warning',
        approved: 'badge-success',
        rejected: 'badge-danger',
        posted: 'badge-primary',
        ignored: 'badge-muted',
    };
    return `<span class="badge ${colors[status] || 'badge-muted'}">${status}</span>`;
}

export function truncate(str: string, len = 150): string {
    if (str.length <= len) return str;
    return str.substring(0, len) + '…';
}

export function timeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(dateStr).toLocaleDateString();
}
