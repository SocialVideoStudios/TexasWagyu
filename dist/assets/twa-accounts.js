/* TWA member accounts: re-onboarding members from the old system.
 *
 * STAND-IN: the roster comes from admin-members.json and activations are saved in
 * this browser's localStorage. Sign-in "links" are opened directly in the preview.
 * When Supabase is connected: roster -> members table, sign-in -> Supabase magic
 * links / invites, activations -> a column on the members table.
 */
(function () {
  'use strict';
  var ACT = 'twa-activations-v1', SESSION = 'twa-session';
  var rosterPromise = null;
  function loadRoster() {
    if (!rosterPromise) rosterPromise = fetch('admin-members.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('roster'); return r.json(); });
    return rosterPromise;
  }
  // Same key the admin page uses for a member.
  function keyOf(m) { return [(m.name || '').trim().toLowerCase(), (m.email || '').trim().toLowerCase(), (m.company || '').trim().toLowerCase()].join('|'); }
  function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64url(t) { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; return decodeURIComponent(escape(atob(t))); }
  // Preview-only token. The real one will be a single-use, expiring Supabase link.
  function tokenFor(m) { return b64url(keyOf(m)); }
  function findByToken(roster, t) { try { var k = unb64url(t); return roster.find(function (m) { return keyOf(m) === k; }) || null; } catch (e) { return null; } }
  var RANK = { 'Active': 0, 'Check status': 1, 'Expired': 2, 'Not on either list': 3 };
  function findByEmail(roster, email) {
    email = String(email || '').trim().toLowerCase(); if (!email) return [];
    return roster.filter(function (m) { return (m.email || '').trim().toLowerCase() === email; })
      .sort(function (a, b) { return (RANK[a.status] || 9) - (RANK[b.status] || 9); });
  }
  function readActs() { try { return JSON.parse(localStorage.getItem(ACT) || '{}') || {}; } catch (e) { return {}; } }
  function activation(m) { return readActs()[keyOf(m)] || null; }
  function saveActivation(m, data) {
    var all = readActs(), k = keyOf(m);
    all[k] = Object.assign({}, all[k] || {}, data, { activatedAt: (all[k] && all[k].activatedAt) || new Date().toISOString(), updatedAt: new Date().toISOString() });
    try { localStorage.setItem(ACT, JSON.stringify(all)); } catch (e) {}
    return all[k];
  }
  function setSession(m) { try { sessionStorage.setItem(SESSION, keyOf(m)); } catch (e) {} }
  function sessionKey() { try { return sessionStorage.getItem(SESSION); } catch (e) { return null; } }
  function signOut() { try { sessionStorage.removeItem(SESSION); } catch (e) {} }
  function maskEmail(e) { var p = String(e).split('@'); if (p.length < 2) return e; return p[0].slice(0, 1) + '•••' + (p[0].length > 1 ? p[0].slice(-1) : '') + '@' + p[1]; }
  function firstName(m) { var n = (m.name || m.company || '').trim(); return n.split(/\s+|&/)[0] || 'there'; }
  window.TWAAccounts = { loadRoster: loadRoster, keyOf: keyOf, tokenFor: tokenFor, findByToken: findByToken, findByEmail: findByEmail,
    activation: activation, allActivations: readActs, saveActivation: saveActivation, setSession: setSession, sessionKey: sessionKey, signOut: signOut,
    maskEmail: maskEmail, firstName: firstName };
})();
