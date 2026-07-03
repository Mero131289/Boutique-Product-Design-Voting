<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin | Favorite Design Poll</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="shell">
    <div class="topbar"></div>

    <section class="hero">
      <h1>Poll admin</h1>
      <p>Control voting, display the QR code, and export results.</p>
    </section>

    <section id="loginPanel" class="panel">
      <h2>Admin login</h2>
      <div class="form-row">
        <label for="pin">Admin PIN</label>
        <input id="pin" type="password" inputmode="numeric" placeholder="Enter PIN" />
      </div>
      <button id="loginBtn" class="primary-btn">Unlock admin</button>
      <div id="loginMessage" class="notice hidden"></div>
      <p class="footer-note">Default PIN is 2468 unless changed with the ADMIN_PIN environment variable.</p>
    </section>

    <section id="adminPanel" class="admin-grid hidden">
      <article class="panel">
        <h2>Voting controls</h2>
        <div class="kpi-grid">
          <div class="kpi"><span>Status</span><strong id="statusKpi">—</strong></div>
          <div class="kpi"><span>Total votes</span><strong id="votesKpi">0</strong></div>
          <div class="kpi"><span>Capacity</span><strong id="capacityKpi">250</strong></div>
        </div>
        <div class="admin-actions">
          <button id="openBtn" class="secondary-btn">Open voting</button>
          <button id="closeBtn" class="secondary-btn">Close voting</button>
          <button id="hideResultsBtn" class="ghost-btn">Hide results</button>
          <button id="downloadBtn" class="ghost-btn">Download CSV</button>
          <button id="resetBtn" class="danger-btn">Reset votes</button>
        </div>
        <div id="adminMessage" class="notice hidden"></div>
      </article>

      <article class="panel">
        <h2>Audience QR code</h2>
        <div class="qr-card">
          <img id="qr" alt="QR code for voting page" />
          <div id="voteLink" class="link-box"></div>
          <div class="admin-actions">
            <button id="copyVoteLink" class="secondary-btn">Copy vote link</button>
            <button id="openResults" class="ghost-btn">Open results screen</button>
          </div>
        </div>
      </article>

      <article class="panel" style="grid-column: 1 / -1;">
        <h2>Live results preview</h2>
        <div id="resultsRows"></div>
      </article>
    </section>
  </main>

  <script src="/app.js"></script>
  <script>
    const { $, getState, connectEvents, icon, renderTopbar, renderResultsRows, downloadCsv } = window.PollApp;
    let state = null;
    let adminPin = localStorage.getItem('favorite-design-admin-pin') || '';

    function audienceUrl() {
      return `${window.location.origin}/`;
    }

    function resultsUrl() {
      return `${window.location.origin}/results`;
    }

    function setMessage(id, text, type = 'good') {
      const el = $(id);
      el.className = `notice ${type}`;
      el.textContent = text;
    }

    function hideMessage(id) {
      const el = $(id);
      el.className = 'notice hidden';
      el.textContent = '';
    }

    function render() {
      if (!state) return;
      renderTopbar(document, state, state.open
        ? `<div class="badge success">Voting open</div>`
        : `<div class="badge danger">Voting closed</div>`);

      $('#statusKpi').textContent = state.open ? 'Open' : 'Closed';
      $('#votesKpi').textContent = state.total;
      $('#capacityKpi').textContent = state.capacity;
      $('#hideResultsBtn').textContent = state.revealResults ? 'Hide results' : 'Reveal results';
      renderResultsRows($('#resultsRows'), state);
      $('#voteLink').textContent = audienceUrl();
      $('#qr').src = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=20&data=${encodeURIComponent(audienceUrl())}`;
    }

    async function login() {
      const pin = $('#pin').value.trim();
      hideMessage('#loginMessage');
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });
        const payload = await res.json();
        if (!res.ok || !payload.ok) throw new Error('Incorrect PIN.');
        adminPin = pin;
        localStorage.setItem('favorite-design-admin-pin', adminPin);
        $('#loginPanel').classList.add('hidden');
        $('#adminPanel').classList.remove('hidden');
        render();
      } catch (err) {
        setMessage('#loginMessage', err.message, 'warn');
      }
    }

    async function adminAction(action, extra = {}) {
      try {
        const res = await fetch('/api/admin/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Pin': adminPin },
          body: JSON.stringify({ action, ...extra })
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Action failed.');
        state = payload.state;
        render();
        setMessage('#adminMessage', 'Updated.', 'good');
      } catch (err) {
        setMessage('#adminMessage', err.message, 'warn');
      }
    }

    $('#loginBtn').addEventListener('click', login);
    $('#pin').addEventListener('keydown', event => { if (event.key === 'Enter') login(); });
    $('#openBtn').addEventListener('click', () => adminAction('open'));
    $('#closeBtn').addEventListener('click', () => adminAction('close'));
    $('#hideResultsBtn').addEventListener('click', () => adminAction('toggleResults', { revealResults: !state.revealResults }));
    $('#downloadBtn').addEventListener('click', () => downloadCsv(state));
    $('#resetBtn').addEventListener('click', () => {
      if (confirm('Reset all votes? This cannot be undone.')) adminAction('reset');
    });
    $('#copyVoteLink').addEventListener('click', async () => {
      await navigator.clipboard.writeText(audienceUrl());
      setMessage('#adminMessage', 'Vote link copied.', 'good');
    });
    $('#openResults').addEventListener('click', () => window.open(resultsUrl(), '_blank'));

    getState().then(initial => {
      state = initial;
      if (adminPin) $('#pin').value = adminPin;
      render();
      connectEvents(next => { state = next; if (!$('#adminPanel').classList.contains('hidden')) render(); });
    });
  </script>
</body>
</html>
