/* TWA membership pricing + Industry Partner / Member Benefit data.
 *
 * STAND-IN STORAGE: everything is saved in this browser's localStorage until the
 * TWA database (Supabase) is connected. Only the functions in the "store" section
 * touch storage, so they are the only ones to swap out later.
 */
(function () {
  'use strict';

  // ---------- Pricing ----------
  // New rates start March 1, 2027 (midnight US Central).
  var PRICE_CHANGE = new Date('2027-03-01T00:00:00-06:00');
  var PARTNER_FEE = 1000; // Industry Partner opt-in, per year
  var PLANS = {
    preferred:        { label: 'Preferred',      before: 150,  after: 250,  term: 'annual' },
    associate:        { label: 'Associate',      before: 150,  after: 250,  term: 'annual' },
    'preferred-plus': { label: 'Preferred Plus', before: 433,  after: 433,  term: 'annual' },
    lifetime:         { label: 'Lifetime',       before: 1500, after: 1500, term: 'once' }
  };
  function now() { return new Date(); }
  function beforeIncrease(d) { return (d || now()) < PRICE_CHANGE; }
  function yearlyPrice(planKey, d) { var p = PLANS[planKey]; if (!p) return 0; return beforeIncrease(d) ? p.before : p.after; }
  function planPrice(planKey, years, d) {
    var p = PLANS[planKey]; if (!p) return 0;
    if (p.term === 'once') return yearlyPrice(planKey, d);
    return yearlyPrice(planKey, d) * (years === 5 ? 5 : 1);
  }
  function money(n) { return '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

  // ---------- Store (swap for Supabase later) ----------
  var KEY = 'twa-industry-partners-v1';
  var MINE = 'twa-my-partner-id';
  function read() {
    try { var d = JSON.parse(localStorage.getItem(KEY) || '{}'); return Array.isArray(d.partners) ? d : { partners: [] }; }
    catch (e) { return { partners: [] }; }
  }
  function write(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { throw new Error('Could not save. The logo may be too large; try a smaller image.'); }
    try { window.dispatchEvent(new CustomEvent('twa-partners-changed')); } catch (e) {}
  }
  function uid(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function allPartners() { return read().partners; }
  function getPartner(id) { return allPartners().find(function (p) { return p.id === id; }) || null; }
  function savePartner(partner) {
    var data = read(), i = data.partners.findIndex(function (p) { return p.id === partner.id; });
    partner.updatedAt = new Date().toISOString();
    if (i >= 0) data.partners[i] = partner; else data.partners.push(partner);
    write(data); return partner;
  }
  function updateOffering(partnerId, offeringId, changes) {
    var data = read(), p = data.partners.find(function (x) { return x.id === partnerId; });
    if (!p) return null;
    var o = (p.offerings || []).find(function (x) { return x.id === offeringId; });
    if (!o) return null;
    Object.keys(changes).forEach(function (k) { o[k] = changes[k]; });
    p.updatedAt = new Date().toISOString();
    write(data); return o;
  }
  function myPartnerId() { try { return localStorage.getItem(MINE); } catch (e) { return null; } }
  function setMyPartnerId(id) { try { if (id) localStorage.setItem(MINE, id); else localStorage.removeItem(MINE); } catch (e) {} }

  // ---------- Partner + offering helpers ----------
  function partnerActive(p, d) { return !!(p && p.paidUntil && new Date(p.paidUntil) > (d || now())); }
  function newPartner() {
    var paid = new Date(), until = new Date(paid); until.setFullYear(until.getFullYear() + 1);
    return { id: uid('partner'), company: '', ein: '', logo: '', website: '', category: '', contactName: '', email: '', phone: '',
      description: '', paidAt: paid.toISOString(), paidUntil: until.toISOString(), createdAt: paid.toISOString(), offerings: [] };
  }
  function newOffering() {
    return { id: uid('offer'), title: '', description: '', link: '', hasDiscount: true, discountType: 'percent', discountValue: '',
      code: '', redeem: '', estSavings: '', expires: '', status: 'draft', inCheckout: false, order: 999, submittedAt: '' };
  }
  function discountLabel(o) {
    if (!o || !o.hasDiscount) return '';
    var v = String(o.discountValue || '').trim();
    if (o.discountType === 'percent') return (v ? v.replace(/%$/, '') + '% off' : 'Member discount');
    if (o.discountType === 'amount') return (v ? money(String(v).replace(/[$,]/g, '')) + ' off' : 'Member discount');
    return v ? 'Free: ' + v : 'Free with membership';
  }
  function savingsOf(o) { var n = Number(String(o && o.estSavings || '').replace(/[$,]/g, '')); return isFinite(n) && n > 0 ? n : 0; }
  function offerExpired(o, d) { return !!(o.expires && new Date(o.expires + 'T23:59:59') < (d || now())); }

  // Flatten offerings with their partner attached.
  function flat(filterFn) {
    var out = [];
    allPartners().forEach(function (p) { (p.offerings || []).forEach(function (o) { if (!filterFn || filterFn(o, p)) out.push({ offering: o, partner: p }); }); });
    return out;
  }
  // Public Member Benefits page: approved discounts from paid-up partners.
  function publicBenefits() {
    return flat(function (o, p) { return o.status === 'approved' && o.hasDiscount && partnerActive(p) && !offerExpired(o); })
      .sort(function (a, b) { return (a.offering.order - b.offering.order) || a.partner.company.localeCompare(b.partner.company); });
  }
  // Checkout funnel: the subset admin switched on.
  function checkoutBenefits() { return publicBenefits().filter(function (x) { return x.offering.inCheckout; }); }

  // Shrink an uploaded logo so it fits comfortably in storage.
  function resizeImage(file, max) {
    max = max || 360;
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Please choose an image file (PNG, JPG, SVG or WebP).'));
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read that file.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Could not open that image.')); };
        img.onload = function () {
          var scale = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  window.TWA = {
    pricing: { PRICE_CHANGE: PRICE_CHANGE, PLANS: PLANS, PARTNER_FEE: PARTNER_FEE, beforeIncrease: beforeIncrease, yearlyPrice: yearlyPrice, planPrice: planPrice, money: money },
    partners: { all: allPartners, get: getPartner, save: savePartner, updateOffering: updateOffering, myId: myPartnerId, setMyId: setMyPartnerId,
      isActive: partnerActive, create: newPartner, newOffering: newOffering, discountLabel: discountLabel, savingsOf: savingsOf,
      offerExpired: offerExpired, flat: flat, publicBenefits: publicBenefits, checkoutBenefits: checkoutBenefits, resizeImage: resizeImage },
    esc: esc,
    CATEGORIES: ['Genetics & semen', 'Feed & nutrition', 'Animal health & vet', 'Equipment & handling', 'Processing & butchery', 'Marketing & media', 'Financial & insurance', 'Software & services', 'Other']
  };
  window.addEventListener('storage', function (e) { if (e.key === KEY) { try { window.dispatchEvent(new CustomEvent('twa-partners-changed')); } catch (x) {} } });
})();
