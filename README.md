<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Live Results | Favorite Design Poll</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="shell">
    <div class="topbar"></div>

    <section class="hero">
      <h1 id="question">Live results</h1>
      <p id="subtitle">Results update automatically as votes come in.</p>
    </section>

    <section class="results-layout">
      <article class="panel">
        <div class="big-total"><strong id="totalVotes">0</strong><span>votes received</span></div>
        <div id="resultsRows"></div>
      </article>

      <aside class="panel">
        <h2>Current leader</h2>
        <div id="leader" class="leader-card"></div>
      </aside>
    </section>

    <p class="footer-note">Open this page on the presentation screen. Keep the voting page on the QR code for guests.</p>
  </main>

  <script src="/app.js"></script>
  <script>
    const { $, getState, connectEvents, icon, renderTopbar, renderResultsRows, winnerFromState, formatPct } = window.PollApp;
    let state = null;

    function render() {
      if (!state) return;
      renderTopbar(document, state, state.open
        ? `<div class="badge success">Live voting open</div>`
        : `<div class="badge danger">Voting closed</div>`);
      $('#question').textContent = state.question;
      $('#subtitle').textContent = state.revealResults ? 'Results update automatically as votes come in.' : 'Results are currently hidden by the admin.';
      $('#totalVotes').textContent = state.total;
      const rows = $('#resultsRows');
      const leader = $('#leader');
      if (!state.revealResults) {
        rows.innerHTML = '<div class="notice warn">Results are hidden for now.</div>';
        leader.innerHTML = '<div class="notice warn">Waiting for admin to reveal results.</div>';
        return;
      }
      renderResultsRows(rows, state);
      const top = winnerFromState(state);
      if (!top || state.total === 0) {
        leader.innerHTML = '<div class="notice">Waiting for the first vote.</div>';
      } else {
        const votes = state.counts[top.id] || 0;
        const pct = state.percentages[top.id] || 0;
        leader.innerHTML = `
          <img src="${top.image}" alt="${top.label}" />
          <div class="winner">${top.label}: ${votes} votes · ${formatPct(pct)}</div>
        `;
      }
    }

    getState().then(initial => {
      state = initial;
      render();
      connectEvents(next => { state = next; render(); });
    });
  </script>
</body>
</html>
