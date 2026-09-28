/* DLH NEXUS real connector UI layer.
   Keeps the existing connector catalogue and only upgrades providers
   that have a secure server-side OAuth implementation. */
(function () {
  'use strict';

  var REAL = {
    GitHub: 'github',
    'Google Drive': 'google',
    'Google Calendar': 'google',
    Gmail: 'google',
    Slack: 'slack',
    Notion: 'notion'
  };

  function status(provider) {
    return fetch('/api/connectors/' + encodeURIComponent(provider) + '?action=status', {
      credentials: 'same-origin'
    }).then(function (r) { return r.ok ? r.json() : { connected: false }; })
      .catch(function () { return { connected: false }; });
  }

  function upgradeCard(card, provider) {
    if (!card || card.dataset.realConnector === provider) return;
    card.dataset.realConnector = provider;

    var old = card.querySelector('.connector-status');
    if (!old) return;

    var button = old.cloneNode(true);
    old.replaceWith(button);
    button.classList.add('real-connector-status');
    button.style.cursor = 'pointer';

    function paint(connected) {
      var span = button.querySelector('span:last-child');
      var dot = button.querySelector('.status-dot');
      if (span) span.textContent = connected ? 'Connected' : 'Connect';
      if (dot) dot.className = 'status-dot ' + (connected ? 'done' : 'done');
      button.classList.toggle('connected', connected);
    }

    status(provider).then(function (s) { paint(!!s.connected); });

    button.addEventListener('click', function () {
      status(provider).then(function (s) {
        if (s.connected) {
          fetch('/api/connectors/' + encodeURIComponent(provider) + '?action=disconnect', {
            method: 'POST', credentials: 'same-origin'
          }).finally(function () { paint(false); });
          return;
        }
        window.location.href = '/api/connectors/' + encodeURIComponent(provider) + '?action=start';
      });
    });
  }

  function upgradeVisibleCards() {
    document.querySelectorAll('#connectors-grid .connector-card').forEach(function (card) {
      var name = card.querySelector('.connector-name');
      if (!name) return;
      var provider = REAL[name.textContent.trim()];
      if (provider) upgradeCard(card, provider);
    });
  }

  function init() {
    upgradeVisibleCards();
    var grid = document.getElementById('connectors-grid');
    if (grid && window.MutationObserver) {
      new MutationObserver(upgradeVisibleCards).observe(grid, { childList: true });
    }
    var params = new URLSearchParams(location.search);
    var connected = params.get('connector_connected');
    var error = params.get('connector_error');
    if (connected || error) {
      history.replaceState({}, '', location.pathname + location.hash);
      setTimeout(upgradeVisibleCards, 250);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();