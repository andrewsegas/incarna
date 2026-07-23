/**
 * lobby — the entry screen. Shows who lives in your office and a single ENTER
 * button. After entering, you pick who to talk to just by looking at them.
 */
(function () {
  const K = new URL(location.href).searchParams.get('k') || '';
  const withK = (url) => (K ? url + (url.includes('?') ? '&' : '?') + 'k=' + encodeURIComponent(K) : url);

  const lobby = document.getElementById('lobby');
  const roster = document.getElementById('roster');
  const enterBtn = document.getElementById('enter-btn');
  const note = document.getElementById('lobby-note');

  window.qmaOpenLobby = () => lobby.classList.remove('hidden');

  const labLink = document.getElementById('lab-link');
  if (labLink) labLink.href = withK('lab.html'); // keep the ?k token

  (async function () {
    let agents = [];
    try {
      const office = await (await fetch(withK('/api/office'))).json();
      agents = office.agents || [];
    } catch (e) {
      roster.textContent = 'Failed to load agents: ' + e.message;
      return;
    }

    if (!agents.length) {
      roster.innerHTML = '<p class="empty">No agents configured yet.<br>Copy <code>agents.example.json</code> to <code>agents.local.json</code> and add yours.</p>';
      enterBtn.disabled = true;
      return;
    }

    // live list of OpenClaw agents you can incarnate into a body
    let brains = [];
    try { brains = (await (await fetch(withK('/api/openclaw-agents'))).json()).agents || []; } catch (e) { /* offline */ }

    roster.innerHTML = '';
    for (const a of agents) {
      const card = document.createElement('div');
      card.className = 'roster-card';
      const chosen = localStorage.getItem('incarna:brain:' + a.id) || a.brain || '';
      const opts = [...new Set([a.brain, ...brains].filter(Boolean))]; // keep configured brain even if /v1/models is off
      const options = opts.map((b) => `<option value="${b}"${b === chosen ? ' selected' : ''}>${b}</option>`).join('');
      card.innerHTML =
        `<span class="roster-emoji">${a.emoji || '🤖'}</span>` +
        `<span class="roster-name">${a.name}</span>` +
        `<span class="roster-desc">${a.desc || ''}</span>` +
        (opts.length ? `<label class="brain-pick">incarnar<select data-avatar="${a.id}">${options}</select></label>` : '');
      roster.appendChild(card);
    }
    roster.querySelectorAll('select[data-avatar]').forEach((sel) => {
      sel.addEventListener('change', () => localStorage.setItem('incarna:brain:' + sel.dataset.avatar, sel.value));
      sel.addEventListener('click', (e) => e.stopPropagation());
    });
    note.textContent = agents.length > 1
      ? 'Look at an avatar to talk to them. Hold the mic (or grip) to speak.'
      : 'Hold the mic button (or a controller trigger) to speak.';
  })();

  enterBtn.addEventListener('click', async () => {
    lobby.classList.add('hidden');
    if (window.qmaStart) await window.qmaStart();
    // try to jump straight into passthrough on headsets; ignore on desktop
    const scene = document.querySelector('a-scene');
    if (scene && scene.enterVR) { scene.enterVR(true).catch(() => {}); }
  });
})();
