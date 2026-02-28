// ── Copy to Clipboard ──────────────────────────────────────────────

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;

    const text = btn.getAttribute('data-text');
    if (!text) return;

    navigator.clipboard.writeText(text.replace(/&#10;/g, '\n')).then(() => {
        showToast('Copied to clipboard!');
        btn.textContent = '✓ Copied';
        setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
    }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text.replace(/&#10;/g, '\n');
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Copied!');
    });
});

// ── Draft Tabs ─────────────────────────────────────────────────────

document.addEventListener('click', (e) => {
    const tab = e.target.closest('.draft-tab');
    if (!tab) return;

    const target = tab.getAttribute('data-target');
    if (!target) return;

    // Deactivate all tabs and panels
    document.querySelectorAll('.draft-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.draft-panel').forEach(p => p.classList.remove('active'));

    // Activate clicked tab and its panel
    tab.classList.add('active');
    const panel = document.getElementById(target);
    if (panel) panel.classList.add('active');
});

// ── Toast ──────────────────────────────────────────────────────────

function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}
