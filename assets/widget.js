/* Noor — "Never Miss a Customer" demo chat engine (Luxe Flow Studio edition).
   Fully personalized build for Luxe Flow Studio, Islamabad — business details
   are hard-coded from the studio's own public posts (see ../DETAILS.md).
   100% client-side. No network calls, no tracking. Works from file:// .
   Leads are persisted to localStorage (simulated owner dashboard).
   Test hooks: ?fast=1 skips delays; window.__maya exposes state + send();
   window.__getLeads/__clearLeads expose and reset the persisted leads. */
(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);
  var FAST = qs.get('fast') === '1';

  /* ---------- business profile (hard-coded — Luxe Flow Studio) ---------- */
  var BIZ = {
    name: 'Luxe Flow Studio',
    tagline: 'Pilates · Wellness',
    city: 'Islamabad',
    address: 'Islamabad — exact location shared on booking',
    phone: '0331 5583785',
    phoneHref: 'tel:+923315583785',
    whatsapp: 'https://wa.me/923315583785',
    host: 'Noor'
  };
  // short ref prefix from the name's initials: "Luxe Flow Studio" -> "LF"
  BIZ.refPrefix = (BIZ.name.split(/\s+/).map(function (w) { return w.charAt(0); }).filter(function (c) { return /[A-Za-z]/.test(c); }).join('').slice(0, 2).toUpperCase()) || 'LF';

  /* apply the profile to the page (all [data-biz] slots already carry the
     same hard-coded values in the HTML — this keeps title/meta in sync) */
  function personalize() {
    document.querySelectorAll('[data-biz="name"]').forEach(function (el) { el.textContent = BIZ.name; });
    document.querySelectorAll('[data-biz="tagline"]').forEach(function (el) { el.textContent = BIZ.tagline; });
    document.querySelectorAll('[data-biz="city"]').forEach(function (el) { el.textContent = BIZ.city; });
    document.querySelectorAll('[data-biz="address"]').forEach(function (el) { el.textContent = BIZ.address; });
    document.querySelectorAll('[data-biz="phone"]').forEach(function (el) { el.textContent = BIZ.phone; });
    document.querySelectorAll('#call-cta, a[data-biz="phone"]').forEach(function (el) { el.setAttribute('href', BIZ.phoneHref); });
    document.querySelectorAll('[data-biz="host"]').forEach(function (el) { el.textContent = BIZ.host; });
    document.querySelectorAll('[data-biz="host-initial"]').forEach(function (el) { el.textContent = BIZ.host.charAt(0); });
    var ab = document.getElementById('addr-biz');
    if (ab) ab.textContent = BIZ.name;
    document.title = BIZ.name + ' — ' + BIZ.tagline + ' | ' + BIZ.city;
  }

  /* ---------- dom ---------- */
  var panel, msgs, chipsBox, input, bubble, unread, closeBtn;
  var opened = false, autoOpened = false, greeted = false;

  /* conversation state */
  var S = {
    mode: 'idle',          // idle | booking | afterhours | review | quiz
    step: 0,
    booking: {},
    ah: {},
    quiz: {},
    lastTopic: null
  };

  function $(id) { return document.getElementById(id); }

  function delay(ms) {
    return new Promise(function (res) { setTimeout(res, FAST ? 0 : ms); });
  }

  function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  }

  /* ---------- rendering ---------- */
  function addUser(text) {
    var row = el('div', 'mrow user');
    row.appendChild(el('div', 'bubble', escapeHtml(text)));
    msgs.appendChild(row); scrollDown();
  }

  function addBot(html, opts) {
    var row = el('div', 'mrow bot');
    row.appendChild(el('div', 'mavatar', BIZ.host.charAt(0)));
    var b = el('div', 'bubble', html);
    row.appendChild(b);
    msgs.appendChild(row);
    if (opts && opts.notice) b.classList.add('notice');
    scrollDown();
    return b;
  }

  function addNotice(html) {
    var row = el('div', 'mrow bot');
    row.appendChild(el('div', 'notice', html));
    row.style.maxWidth = '100%';
    msgs.appendChild(row); scrollDown();
  }

  function addDashCard(rows) {
    var row = el('div', 'mrow bot');
    var card = el('div', 'dashcard');
    card.appendChild(el('div', 'dl-head', '&#128203; Saved to your dashboard'));
    rows.forEach(function (r) {
      card.appendChild(el('div', 'dl-row', '<span>' + r[0] + ':</span> <b>' + escapeHtml(r[1]) + '</b>'));
    });
    row.appendChild(card);
    row.style.maxWidth = '100%';
    msgs.appendChild(row); scrollDown();
  }

  function showTyping() {
    var row = el('div', 'mrow bot', '');
    row.id = 'maya-typing-row';
    row.appendChild(el('div', 'mavatar', BIZ.host.charAt(0)));
    var b = el('div', 'bubble typing', '<i></i><i></i><i></i>');
    row.appendChild(b);
    msgs.appendChild(row); scrollDown();
  }
  function hideTyping() {
    var t = $('maya-typing-row');
    if (t) t.remove();
  }

  function setChips(list) {
    chipsBox.innerHTML = '';
    (list || []).forEach(function (c) {
      var btn = el('button', 'chip', c.label);
      btn.type = 'button';
      btn.addEventListener('click', function () { userSays(c.value || c.label, c.silent); });
      chipsBox.appendChild(btn);
    });
    scrollDown();
  }

  function showStars() {
    chipsBox.innerHTML = '';
    var wrap = el('div', 'stars-row');
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var s = el('button', 'star-btn', '&#11088;');
        s.type = 'button';
        s.setAttribute('aria-label', n + ' star' + (n > 1 ? 's' : ''));
        s.addEventListener('click', function () { pickStars(n); });
        wrap.appendChild(s);
      })(i);
    }
    chipsBox.appendChild(wrap);
    scrollDown();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- tap-to-call + WhatsApp ---------- */
  function callLinkHtml() {
    return '<a class="call-link" href="' + BIZ.phoneHref + '">&#128222; Call ' + escapeHtml(BIZ.phone) + '</a>';
  }
  function waLinkHtml() {
    return '<a class="call-link" href="' + BIZ.whatsapp + '" target="_blank" rel="noopener">&#128172; WhatsApp us</a>';
  }

  /* ---------- bot speech ---------- */
  function say(html, chips, opts) {
    showTyping();
    var wait = Math.min(700 + html.length * 6, 1900);
    return delay(wait).then(function () {
      hideTyping();
      addBot(html);
      setChips(chips);
    });
  }

  function sayMany(items) {
    // items: [{html, chips, notice, dash}]
    var p = Promise.resolve();
    items.forEach(function (it) {
      p = p.then(function () {
        showTyping();
        var wait = Math.min(600 + (it.html || '').length * 5, 1700);
        return delay(wait).then(function () {
          hideTyping();
          if (it.dash) { addDashCard(it.dash); }
          else if (it.notice) { addNotice(it.html); }
          else { addBot(it.html); }
          setChips(it.chips);
        });
      });
    });
    return p;
  }

  /* ---------- helpers ---------- */
  function makeRef() {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var r = '';
    for (var i = 0; i < 5; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return BIZ.refPrefix + '-' + r;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* word-start keyword match (proven 2026-10-03 standard): "anywhere" must not
     trigger the location branch via "where", "foreclosure" must not trip hours
     via "close", "separate my bills" must not trip review via "rate", "recall
     our chat" must not trip the human branch via "call". Prefix keywords like
     'schedul'/'appoint' still match 'schedule'/'appointment'; phrases keep
     word-start match. */
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function has(t) {
    var words = Array.prototype.slice.call(arguments, 1);
    return words.some(function (w) {
      return new RegExp('(^|[^a-z])' + escRe(w)).test(t);
    });
  }

  function canonChoice(t, options) {
    var tl = t.toLowerCase();
    for (var i = 0; i < options.length; i++) {
      if (tl === options[i].toLowerCase()) return options[i];
    }
    return t.trim().slice(0, 60); /* free text accepted, length-capped */
  }

  /* Simulated owner dashboard: leads persist in the browser (localStorage).
     A real client build syncs these to the studio's CRM / booking system. */
  var LEAD_KEY = 'nmc_luxeflow_leads';
  var leads = [];
  try { leads = JSON.parse(localStorage.getItem(LEAD_KEY) || '[]'); } catch (e) { leads = []; }
  function saveLead(l) {
    l.at = new Date().toISOString(); l.biz = BIZ.name;
    leads.push(l);
    try { localStorage.setItem(LEAD_KEY, JSON.stringify(leads)); } catch (e) {}
    renderInbox(); /* keep the prospect-visible inbox panel live */
  }

  /* ---------- captured-leads inbox preview (prospect-visible panel) ----------
     The after-hours card promises "Saved to your dashboard" — this panel makes
     that claim visible on the page. Reads localStorage only, everything escaped. */
  var inboxEls = null;
  function inboxDom() {
    if (!inboxEls) {
      var p = document.getElementById('inbox-panel'),
          l = document.getElementById('inbox-list'),
          t = document.getElementById('inbox-toggle'),
          c = document.getElementById('inbox-count');
      if (!p || !l || !t) return null;
      inboxEls = { panel: p, list: l, toggle: t, count: c };
    }
    return inboxEls;
  }
  function fmtLeadTime(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso || '';
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) { return iso || ''; }
  }
  function renderInbox() {
    var dom = inboxDom();
    if (!dom) return;
    if (dom.count) dom.count.textContent = String(leads.length);
    if (!leads.length) {
      dom.list.innerHTML = '<div class="inbox-empty"><b>No leads yet</b> &mdash; try the &#127769; 11:42 PM after-hours flow in the chat &mdash; the captured lead will appear right here.</div>';
      return;
    }
    dom.list.innerHTML = leads.slice().reverse().map(function (l) {
      var when = l.at
        ? '<time datetime="' + escapeHtml(l.at) + '">' + escapeHtml(fmtLeadTime(l.at)) + '</time>'
        : '&mdash;';
      var detail = (l.details && l.details !== '\u2014' && l.details !== '-')
        ? '<div class="lead-detail">&ldquo;' + escapeHtml(l.details) + '&rdquo;</div>'
        : '';
      return '<div class="lead-row">' +
        '<span class="lead-name">' + escapeHtml(l.name || '\u2014') + '</span>' +
        '<span class="lead-tag">' + escapeHtml(l.topic || 'Lead') + '</span>' +
        '<span class="lead-phone">' + escapeHtml(l.phone || '\u2014') + '</span>' +
        '<span class="lead-src">' + escapeHtml(l.source || '') + '</span>' +
        '<div class="lead-when">Captured ' + when + '</div>' +
        detail +
        '</div>';
    }).join('');
  }

  /* ---------- intent answers ---------- */
  function servicesHtml() {
    return 'Everything flows from one serene, women-only space. &#127800;<br><br>' +
      '<b>Classes:</b><br>&middot; <b>Reformer Pilates</b> &mdash; resistance-based strength &amp; posture<br>' +
      '&middot; <b>Mat Pilates</b> &mdash; bodyweight core, flexibility &amp; breath<br>' +
      '&middot; <b>Clinical Pilates</b> &mdash; physio-led, for pain &amp; posture<br>' +
      '&middot; <b>Women&rsquo;s Kickboxing Club</b> &mdash; Fridays, 4:00 PM<br><br>' +
      '<b>Therapies (by appointment):</b><br>&middot; Physiotherapy &middot; Dry Cupping<br>' +
      '&middot; Lymphatic Drainage &amp; Deep Tissue Massage<br>' +
      '&middot; Breathwork &middot; Nutritional Guidance<br><br>' +
      'Our named group classes are <b>Morning Burn</b> and <b>Evening Sculpt</b> &mdash; small, intimate groups. What are you drawn to?';
  }

  function reformerHtml() {
    return '<b>Reformer Pilates</b> is our signature strength work &mdash; resistance-based training that builds posture, tones deeply and protects your joints. &#127800;<br><br>' +
      'Classes are <b>small and intimate</b>, led by our DPT physiotherapists, and our group classes run as <b>Morning Burn</b> and <b>Evening Sculpt</b>. The team confirms the current class schedule on WhatsApp when you book. Shall I book you in?';
  }

  function matHtml() {
    return '<b>Mat Pilates</b> &mdash; bodyweight core stability, flexibility and breath. The foundation of everything we do at Luxe Flow. &#127800;<br><br>' +
      'It&rsquo;s part of our small-group class schedule (<b>Morning Burn</b> &amp; <b>Evening Sculpt</b>), and the team confirms current timings on WhatsApp when you book. Want me to book you in?';
  }

  function clinicalHtml() {
    return '<b>Clinical Pilates</b> is our physiotherapist-led stream &mdash; created for <b>chronic pain and postural issues</b>, where regular Pilates isn&rsquo;t quite the right fit. &#129658;<br><br>' +
      'You&rsquo;ll be guided by <b>Dr. Maryam</b> and <b>Dr. Tayyaba</b>, our DPT physiotherapists. Shall I book you an assessment session?';
  }

  function physioHtml() {
    return '<b>Physiotherapy</b> at Luxe Flow is led by <b>Dr. Maryam</b> and <b>Dr. Tayyaba</b> &mdash; DPT physiotherapists, internationally certified. Sessions include hands-on recovery techniques such as TENS therapy and manual therapy. &#129658;<br><br>' +
      'A physiotherapy session is <b>PKR 5,000</b>, and sessions are <b>by appointment only</b>. Shall I book yours?';
  }

  function cuppingHtml() {
    return '<b>Dry Cupping Therapy</b> &mdash; for release, circulation and recovery, in our women-only therapy space. &#127800;<br><br>' +
      'Cupping is <b>by appointment only</b> &mdash; and there&rsquo;s <b>20% off on Sunnah days</b>. Shall I book you a session?';
  }

  function massageHtml() {
    return 'Our recovery massages: <b>Lymphatic Drainage</b> &mdash; gentle work that supports circulation and lightness &mdash; and <b>Deep Tissue Massage</b> for deeper release. &#128134;<br><br>' +
      'Both are <b>by appointment only</b> in our women-only studio. Shall I book you in?';
  }

  function breathworkHtml() {
    return '<b>Breathwork &amp; mindful practice</b> &mdash; space to slow down, breathe deeply and come home to yourself. &#127807;<br><br>' +
      'Our breathwork circle, <b>The Inner Garden</b>, is guided by certified practitioner <b>Syeda Sima Abbas</b> &mdash; circle fee <b>PKR 3,000</b>. Want me to save you a spot at the next circle?';
  }

  function nutritionHtml() {
    return '<b>Nutritional Guidance</b> &mdash; curated nutrition support that fits your movement and your recovery, part of the curated wellness side of Luxe Flow. &#129367;<br><br>' +
      'It pairs beautifully with our <b>LUXE TRANSFORMATION</b> 12-week program. Want me to book you a chat with the team about it?';
  }

  function kickboxingHtml() {
    return 'Our <b>Women&rsquo;s Kickboxing Club</b> &mdash; the <b>first of its kind in the city</b>! &#129354;<br><br>' +
      'Led by <b>Simay Abbas</b>, our UK-certified boxing trainer, every <b>Friday at 4:00 PM</b>. Strong, joyful and completely women-only. Shall I book your first class?';
  }

  function teamHtml() {
    return 'Luxe Flow is led by <b>Dr. Maryam</b> and <b>Dr. Tayyaba</b> &mdash; DPT physiotherapists and internationally certified Pilates experts who lead our group classes themselves. &#127800;<br><br>' +
      '&middot; <b>Simay Abbas</b> &mdash; UK-certified boxing trainer, Women&rsquo;s Kickboxing Club<br>' +
      '&middot; <b>Syeda Sima Abbas</b> &mdash; certified practitioner guiding The Inner Garden breathwork circle<br><br>' +
      'Every session you book is in expert, caring hands.';
  }

  function packagesHtml() {
    return 'Our monthly memberships &mdash; there&rsquo;s a rhythm for everyone: &#127800;<br><br>' +
      '&middot; <b>FLOW STARTER</b> &mdash; 4 classes / month, the gentle entry point<br>' +
      '&middot; <b>FLOW BUILDER</b> &mdash; 8 classes / month<br>' +
      '&middot; <b>FLOW SCULPT</b> &mdash; classes + recovery sessions<br>' +
      '&middot; <b>FLOW ELITE</b> &mdash; up to 20 classes / month + recovery support<br>' +
      '&middot; <b>LUXE PRIV&Eacute;</b> &mdash; 1-on-1 private training, unlimited sessions<br>' +
      '&middot; <b>LUXE TRANSFORMATION</b> &mdash; our 12-week signature program<br><br>' +
      'We also have limited <b>Founding Memberships</b>. Package pricing is shared personally &mdash; the team will walk you through it on WhatsApp: ' + waLinkHtml();
  }

  function pricesHtml() {
    return 'Happy to be transparent about what I can share: &#127800;<br><br>' +
      '&middot; <b>Physiotherapy session</b> &mdash; PKR 5,000<br>' +
      '&middot; <b>Breathwork circle (The Inner Garden)</b> &mdash; PKR 3,000<br>' +
      '&middot; <b>Dry cupping</b> &mdash; 20% off on Sunnah days<br><br>' +
      'Our <b>membership package prices</b> are shared personally by the team &mdash; one quick WhatsApp message and they&rsquo;ll confirm the current rates for you: ' + waLinkHtml() + '<br><br>Anything else I can help with?';
  }

  function offersHtml() {
    return 'A few lovely things to know: &#128149;<br><br>' +
      '&middot; <b>Flow in Two</b> &mdash; our duo offer when you join with your mother, daughter, sister or best friend<br>' +
      '&middot; <b>20% off cupping</b> on Sunnah days<br>' +
      '&middot; <b>Founding Memberships</b> &mdash; limited, with exclusive benefits<br><br>' +
      'Want the details on any of these? The team confirms them on WhatsApp: ' + waLinkHtml();
  }

  function locationHtml() {
    return 'We&rsquo;re in <b>Islamabad</b> &#128205; &mdash; a private, women-only studio. To keep our space serene and safe for our ladies, we share the <b>exact location personally on WhatsApp or DM when you book</b> &mdash; that&rsquo;s simply how we do it for everyone.<br><br>' +
      waLinkHtml() + ' &mdash; or shall I book you in right here?';
  }

  function scheduleHtml() {
    return 'Here&rsquo;s what I can confirm: &#128197;<br><br>' +
      '&middot; <b>Women&rsquo;s Kickboxing Club</b> &mdash; every Friday, 4:00 PM<br>' +
      '&middot; <b>Therapies</b> (physio, cupping, massage) &mdash; by appointment only<br>' +
      '&middot; <b>Group classes</b> &mdash; Morning Burn &amp; Evening Sculpt, small intimate groups<br><br>' +
      'The team confirms the <b>current class schedule</b> on WhatsApp when you book, so you always get this week&rsquo;s exact timings: ' + waLinkHtml();
  }

  function womenOnlyHtml() {
    return 'Yes &mdash; Luxe Flow is a <b>women-only studio</b>, proudly. &#127800; Every class, therapy and circle is designed as a private, comfortable space for women, led by women.<br><br>' +
      'It&rsquo;s boutique Pilates + curated wellness, made just for her.';
  }

  function defaultChips() {
    return [
      { label: '&#127800; Our services' },
      { label: '&#128197; Book a class or session' },
      { label: '&#127873; Packages' },
      { label: '&#127769; After-hours demo' },
      { label: '&#11088; Rate your visit' },
      { label: '&#129517; 60-sec Find your flow quiz', value: 'quiz' }
    ];
  }

  function greet() {
    greeted = true;
    return say(
      'Hello lovely, welcome to <b>' + escapeHtml(BIZ.name) + '</b>! &#127800; I\'m <b>' + escapeHtml(BIZ.host) + '</b>, your wellness coordinator.<br><br>' +
      'Ask me about <b>Reformer Pilates</b>, <b>Clinical Pilates</b>, <b>physiotherapy</b>, our <b>packages</b> &mdash; or I can <b>book your class or session</b> right now. What are you in the mood for?',
      defaultChips()
    );
  }

  /* ---------- flows ---------- */
  var BOOKING_SERVICES = ['Reformer Pilates', 'Mat Pilates', 'Clinical Pilates', 'Physiotherapy', 'Cupping', 'Massage', 'Breathwork', 'Kickboxing'];

  function canonService(t) {
    var tl = t.toLowerCase();
    for (var i = 0; i < BOOKING_SERVICES.length; i++) {
      if (tl === BOOKING_SERVICES[i].toLowerCase()) return BOOKING_SERVICES[i];
    }
    if (has(tl, 'reform')) return 'Reformer Pilates';
    if (has(tl, 'mat pilates', 'mat class')) return 'Mat Pilates';
    if (has(tl, 'clinical')) return 'Clinical Pilates';
    if (has(tl, 'physio')) return 'Physiotherapy';
    if (has(tl, 'cupp')) return 'Cupping';
    if (has(tl, 'massage', 'lymphatic', 'deep tissue')) return 'Massage';
    if (has(tl, 'breath')) return 'Breathwork';
    if (has(tl, 'kickbox', 'boxing')) return 'Kickboxing';
    return t.trim().slice(0, 40); /* free text accepted, length-capped */
  }

  function startBooking() {
    S.mode = 'booking'; S.step = 0; S.booking = {};
    return say('Wonderful &mdash; let&rsquo;s get you flowing. <b>What would you like to book?</b>',
      BOOKING_SERVICES.map(function (r) { return { label: r }; }));
  }

  function bookingStep(text) {
    var t = text.trim();
    var tl = t.toLowerCase();
    if (S.step === 0) {
      S.booking.service = canonService(t); S.step = 1;
      return say('<b>' + escapeHtml(S.booking.service) + '</b> &mdash; beautiful choice. <b>Which day and time</b> suits you best? <i>(e.g. Friday 4 PM, or Saturday morning)</i>');
    }
    if (S.step === 1) {
      if (t.length < 3) {
        return say('And <b>which day and time</b> would you love? <i>(e.g. Friday 4 PM)</i>');
      }
      S.booking.when = t.slice(0, 60); S.step = 2;
      return say('Noted &mdash; <b>' + escapeHtml(S.booking.when) + '</b>. <b>What&rsquo;s your name</b> for the booking?');
    }
    if (S.step === 2) {
      if (t.length < 2 || t.length > 40) {
        return say('And your <b>name</b> for the booking?');
      }
      S.booking.name = t; S.step = 3;
      return say('Lovely to meet you, ' + escapeHtml(cap(t.split(' ')[0])) +
        '! Last step &mdash; your <b>phone number</b>, so the team can confirm your slot and share our location with you.');
    }
    if (S.step === 3) {
      var digits = tl.replace(/\D/g, '');
      // FIXED validation: digit-less text like "notaphone" must be rejected
      if (digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(digits only is fine)</i>');
      }
      S.booking.phone = t;
      var ref = makeRef();
      S.booking.ref = ref;
      S.mode = 'idle'; S.step = 0;
      var line = '<b>&#9989; You&rsquo;re booked in!</b><br><br><b>' +
        escapeHtml(S.booking.service) + '</b> &middot; ' + escapeHtml(S.booking.when) + '<br>Guest: <b>' + escapeHtml(S.booking.name) + '</b><br>' +
        'Reference: <span class="ref">' + ref + '</span><br><br>' +
        'Our team will confirm your slot on <b>' + escapeHtml(S.booking.phone) + '</b> and share our exact location with you. We can&rsquo;t wait to flow with you. &#127800;<br><br>Prefer to talk it through? ' + callLinkHtml() + ' &middot; ' + waLinkHtml();
      return say(line, [{ label: '&#127800; Our services' }, { label: '&#127873; Packages' }]);
    }
  }

  function startAfterHours() {
    S.mode = 'afterhours'; S.step = 0; S.ah = {};
    return sayMany([
      {
        notice: true,
        html: '&#127769; <b>It\'s 11:42 PM</b> &mdash; the studio is quiet and closed right now, but I\'m ' + escapeHtml(BIZ.host) +
          ', ' + escapeHtml(BIZ.name) + '\'s wellness coordinator, and I\'m still here. <b>Wellness questions don\'t keep office hours.</b>'
      },
      { html: 'Tell me your <b>name</b> and I&rsquo;ll make sure the morning team reaches out first thing &mdash; <b>our small classes fill fast</b>.' }
    ]);
  }

  function afterHoursStep(text) {
    var t = text.trim();
    if (S.step === 0) {
      if (t.length < 2 || t.length > 40 || /\d/.test(t)) {
        return say('What <b>name</b> should I save this under?');
      }
      S.ah.name = t; S.step = 1;
      return say('Thanks, ' + escapeHtml(cap(t.split(' ')[0])) + '! And the best <b>number</b> for the morning team to reach you?');
    }
    if (S.step === 1) {
      var digits = t.replace(/\D/g, '');
      // FIXED validation: digit-less text like "notaphone" must be rejected
      if (digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(digits only is fine)</i>');
      }
      S.ah.phone = t; S.step = 2;
      return say('Got it. And just between us &mdash; <b>what are you dreaming of?</b>',
        [{ label: 'Reformer Pilates', value: 'Reformer Pilates' }, { label: 'Physiotherapy', value: 'Physiotherapy' }, { label: 'Cupping', value: 'Cupping' }, { label: 'Kickboxing', value: 'Kickboxing' }, { label: 'Skip', value: 'skip' }]);
    }
    if (S.step === 2) {
      S.ah.goal = (t.toLowerCase() === 'skip') ? 'General inquiry' : t;
      S.mode = 'idle'; S.step = 0;
      saveLead({
        name: S.ah.name,
        phone: S.ah.phone,
        goal: S.ah.goal,
        topic: S.ah.goal,
        details: '\u2014',
        captured: '11:42 PM (after hours)',
        source: 'after-hours demo'
      });
      return sayMany([
        { html: '<b>&#9989; Saved!</b> The morning team will reach out <b>first thing</b> &mdash; our classes are small and fill fast, and now you&rsquo;re first in line. No need to wonder till morning if anyone saw your message.' },
        {
          dash: [
            ['New lead', S.ah.name],
            ['Phone', S.ah.phone],
            ['Interested in', S.ah.goal],
            ['Captured', '11:42 PM (after hours)']
          ]
        },
        {
          html: 'That&rsquo;s the whole point &mdash; <b>every midnight question becomes a morning booking</b>, not a member lost to another studio. Anything else tonight?',
          chips: defaultChips()
        }
      ]);
    }
  }

  function startReview() {
    S.mode = 'review'; S.step = 0;
    return say('We&rsquo;d love to hear it &mdash; <b>how was your visit?</b> Tap the stars:').then(function () {
      showStars();
    });
  }

  function pickStars(n) {
    chipsBox.innerHTML = '';
    addUser('\u2B50'.repeat(n));
    if (n === 5) {
      S.mode = 'idle';
      say('You just made our whole team&rsquo;s day! &#128525;<br><br>Would you <b>share that on Google</b>? It genuinely helps a small women-only studio like ours be found by more ladies.',
        [{ label: 'Not now', value: 'not now' }]).then(function () {
          var row = document.querySelector('#maya-msgs .mrow.bot:last-child .bubble');
          if (row) {
            var a = document.createElement('a');
            a.className = 'gbtn'; a.href = 'https://www.google.com/maps'; a.target = '_blank'; a.rel = 'noopener';
            a.textContent = '\u2B50 Leave a Google review';
            row.appendChild(document.createElement('br'));
            row.appendChild(a); scrollDown();
          }
        });
    } else {
      S.mode = 'review'; S.step = 1;
      say('Thank you for being honest &mdash; that\'s how we get better. <b>What could we do better</b> next time?');
    }
  }

  function reviewStep(text) {
    S.mode = 'idle'; S.step = 0;
    /* 1-4 star feedback is private — persisted as a lead, like the fleet standard */
    saveLead({ name: '(review feedback)', phone: '\u2014', topic: 'Private feedback', details: text.trim(), source: 'review routing' });
    return say('<b>Noted &mdash; truly.</b> Our studio team will personally follow up on this.<br><br>' +
      'We&rsquo;d love a second chance to earn those last stars. Can I book you a session on us to make it right?',
      [{ label: '&#128197; Book a class or session' }, { label: 'No thanks', value: 'no thanks' }]);
  }

  /* ---------- 60-sec "Find your flow" quiz (lead-capture) ----------
     HONESTY (hard rule): Noor NEVER invents prices, outcomes, guarantees, or
     availability — the quiz promises a personalised class recommendation from
     the team, never fabricated specifics. */
  var QUIZ_GOALS = ['Strength & tone', 'Flexibility & mobility', 'Pain relief & posture', 'Recovery & relaxation', 'Confidence & energy'];
  var QUIZ_LEVELS = ['Complete beginner', 'Tried Pilates before', 'Regular practitioner'];

  function startQuiz() {
    S.mode = 'quiz'; S.step = 0; S.quiz = {};
    return say('The <b>60-second Find your flow quiz!</b> &#129517;<br><br>' +
      'Two quick questions and I&rsquo;ll build your <b>flow profile</b> &mdash; then our team will put together a <b>personalised class recommendation</b> just for you. No spam, no guesswork.<br><br>' +
      '<b>What&rsquo;s your main goal?</b>',
      QUIZ_GOALS.map(function (c) { return { label: c }; }));
  }

  function quizStep(text) {
    var t = text.trim();
    if (S.step === 0) {
      S.quiz.goal = canonChoice(t, QUIZ_GOALS); S.step = 1;
      return say('Beautiful &mdash; <b>' + escapeHtml(S.quiz.goal) + '</b>. &#127800;<br><br><b>And your experience level?</b>',
        QUIZ_LEVELS.map(function (c) { return { label: c }; }));
    }
    if (S.step === 1) {
      S.quiz.level = canonChoice(t, QUIZ_LEVELS); S.step = 2;
      return say('Noted &mdash; <b>' + escapeHtml(S.quiz.level) + '</b>. &#127800;<br><br><b>What&rsquo;s your name</b> for the flow profile?');
    }
    if (S.step === 2) {
      if (t.length < 2 || t.length > 40) {
        return say('And your <b>name</b> for the flow profile?');
      }
      S.quiz.name = t; S.step = 3;
      return say('Thanks, ' + escapeHtml(cap(t.split(' ')[0])) + '! And the best <b>number</b> to send your class recommendation to?');
    }
    if (S.step === 3) {
      var digits = t.replace(/\D/g, '');
      if (digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(digits only is fine)</i>');
      }
      S.quiz.phone = t;
      return finishQuiz();
    }
  }

  function finishQuiz() {
    var q = S.quiz;
    saveLead({
      name: q.name,
      phone: q.phone,
      topic: 'Find your flow quiz — qualified lead',
      details: 'Goal ' + q.goal + ' · Level ' + q.level,
      source: 'find your flow quiz'
    });
    S.mode = 'idle'; S.step = 0; S.quiz = {};
    return sayMany([
      { html: '<b>&#9989; Quiz complete!</b> &#129517;<br><br>Here&rsquo;s your flow profile:' },
      {
        dash: [
          ['Goal', q.goal],
          ['Experience', q.level]
        ]
      },
      {
        html: 'Our team will put together your <b>personalised class recommendation</b> and send it to your number &mdash; the right class for your goal and your level, whether that&rsquo;s Reformer, Mat or Clinical Pilates. ' +
          'That&rsquo;s the whole point &mdash; <b>every visitor becomes a booking</b>, not a lady lost to another studio. Anything else I can help with?',
        chips: defaultChips()
      }
    ]);
  }

  /* ---------- main router ---------- */
  function route(text) {
    var t = text.toLowerCase().trim();

    if (S.mode === 'booking') return bookingStep(text);
    if (S.mode === 'afterhours') return afterHoursStep(text);
    if (S.mode === 'quiz') return quizStep(text);
    if (S.mode === 'review' && S.step === 1) return reviewStep(text);

    if (has(t, 'book', 'appoint', 'schedul', 'reserve')) return startBooking();
    if (has(t, 'after hour', 'after-hour', 'closed', 'late night', 'midnight', '11:42')) return startAfterHours();
    if (has(t, 'review', 'rate', 'stars', 'feedback')) return startReview();
    if (has(t, 'quiz', 'find your flow', 'find my flow')) return startQuiz();
    if (has(t, 'kickbox', 'boxing')) return say(kickboxingHtml(), [{ label: '&#128197; Book a class or session' }]);
    if (has(t, 'clinical')) return say(clinicalHtml(), [{ label: '&#128197; Book a class or session' }]);
    if (has(t, 'physio')) return say(physioHtml(), [{ label: '&#128197; Book a class or session' }]);
    if (has(t, 'cupp', 'hijama')) return say(cuppingHtml(), [{ label: '&#128197; Book a class or session' }]);
    if (has(t, 'massage', 'lymphatic', 'deep tissue')) return say(massageHtml(), [{ label: '&#128197; Book a class or session' }]);
    if (has(t, 'breath')) return say(breathworkHtml(), [{ label: '&#128197; Book a class or session' }]);
    if (has(t, 'nutrition', 'diet')) return say(nutritionHtml(), [{ label: '&#128197; Book a class or session' }]);
    if (has(t, 'reform')) return say(reformerHtml(), [{ label: '&#128197; Book a class or session' }]);
    if (has(t, 'mat pilates', 'mat class', 'morning burn', 'evening sculpt')) return say(matHtml(), [{ label: '&#128197; Book a class or session' }]);
    if (has(t, 'who leads', 'who teaches', 'trainer', 'instructor', 'teacher', 'team', 'doctor', 'maryam', 'tayyaba', 'coach')) return say(teamHtml(), [{ label: '&#128197; Book a class or session' }]);
    if (has(t, 'package', 'membership', 'member', 'subscription', 'plan', 'plans')) return say(packagesHtml(), [{ label: '&#128197; Book a class or session' }]);
    if (has(t, 'offer', 'discount', 'deal', 'duo', 'sunnah', 'founding')) return say(offersHtml(), [{ label: '&#127873; Packages' }]);
    if (has(t, 'price', 'cost', 'how much', 'charges', 'fee', 'fees', 'rate card')) return say(pricesHtml(), [{ label: '&#127800; Our services' }]);
    if (has(t, 'women only', 'ladies only', 'only women', 'only ladies', 'men allowed', 'for women', 'for ladies', 'girls')) return say(womenOnlyHtml(), [{ label: '&#127800; Our services' }]);
    /* location branch runs before generic branches (house standard) */
    if (has(t, 'where', 'address', 'location', 'direction', 'find you', 'located')) {
      return say(locationHtml(), [{ label: '&#128197; Book a class or session' }]);
    }
    if (has(t, 'hour', 'open', 'timing', 'timings', 'class time', 'schedule', 'when do you', 'what time')) return say(scheduleHtml(), [{ label: '&#128197; Book a class or session' }]);
    if (has(t, 'service', 'offer', 'do you do', 'classes', 'menu', 'pilates')) return say(servicesHtml(), [{ label: '&#128197; Book a class or session' }]);
    if (has(t, 'human', 'person', 'real person', 'call you', 'phone number', 'phone', 'whatsapp', 'contact', 'speak to')) return say('Of course &mdash; ' + callLinkHtml() + ' or ' + waLinkHtml() + ' and a real human from our team will help you. But honestly? I can handle <b>bookings, services, packages and timings</b> right here, even at 2 AM. &#128521;', defaultChips());
    if (has(t, 'thank', 'thanks', 'thx', 'great', 'awesome', 'perfect')) return say('Anytime, lovely! That\'s what I\'m here for. &#127800;', defaultChips());
    if (has(t, 'bye', 'goodbye', 'see you', 'later')) { S.mode = 'idle'; return say('Stay in flow &mdash; see you soon at ' + escapeHtml(BIZ.name) + '! &#127800;'); }
    if (/\b(hi+|hello|hey+|salam|aoa)\b/.test(t) || has(t, 'good morning', 'good evening', 'assalam')) return say('Hello lovely! &#128075; What can I do for you &mdash; <b>classes</b>, <b>therapies</b>, <b>packages</b>, or shall I <b>book you in</b>?', defaultChips());
    if (has(t, 'no thanks', 'not now', 'nope', "i'm good", 'im good')) { S.mode = 'idle'; return say('No worries at all! I\'m here whenever you need me. &#127800;', defaultChips()); }

    /* graceful fallback — never dead-ends */
    S.lastTopic = text;
    return say('Great question &mdash; let me have the team confirm that for you on WhatsApp: ' + waLinkHtml() + '<br><br>Meanwhile, can I help with a <b>booking</b>, our <b>services</b>, or <b>packages</b>?',
      [{ label: '&#128197; Book a class or session' }, { label: '&#127800; Our services' }, { label: '&#127873; Packages' }]);
  }

  function userSays(text, silent) {
    if (!text || !text.trim()) return Promise.resolve();
    text = text.trim();
    setChips([]);
    if (!silent) addUser(text);
    return route(text);
  }

  /* ---------- open / close ---------- */
  function openPanel(silent) {
    opened = true;
    panel.classList.add('open');
    bubble.classList.add('hidden');
    unread.classList.add('hidden');
    if (!greeted && !silent) greet();
  }
  function closePanel() {
    opened = false;
    panel.classList.remove('open');
    bubble.classList.remove('hidden');
  }

  function init() {
    panel = $('maya-panel'); msgs = $('maya-msgs'); chipsBox = $('maya-chips');
    input = $('maya-input'); bubble = $('maya-bubble'); unread = $('maya-unread'); closeBtn = $('maya-close');
    personalize();

    /* bubble click greets normally; hero CTA passes silent=true to skip straight to booking */
    bubble.addEventListener('click', function () { openPanel(); });
    closeBtn.addEventListener('click', closePanel);
    $('maya-send').addEventListener('click', function () { userSays(input.value); input.value = ''; input.focus(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { userSays(input.value); input.value = ''; }
    });

    /* hero CTA opens widget straight into booking */
    document.querySelectorAll('[data-action="book"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openPanel(true); /* silent: goes straight to booking, no greeting */
        setTimeout(function () { if (S.mode === 'idle') startBooking(); }, FAST ? 50 : 600);
      });
    });

    /* proactive nudge — once, ~8s in */
    setTimeout(function () {
      if (!opened && !autoOpened) {
        autoOpened = true;
        unread.classList.remove('hidden');
        bubble.classList.add('hidden');
        panel.classList.add('open');
        opened = true;
        if (!greeted) greet();
      }
    }, FAST ? 600 : 8000);

    /* captured-leads inbox toggle (prospect-visible "Saved to your dashboard") */
    var idom = inboxDom();
    if (idom) {
      renderInbox();
      idom.toggle.addEventListener('click', function () {
        var isHidden = idom.panel.hasAttribute('hidden');
        if (isHidden) { idom.panel.removeAttribute('hidden'); renderInbox(); }
        else { idom.panel.setAttribute('hidden', ''); }
        idom.toggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      });
    }

    /* test hooks */
    window.__maya = {
      BIZ: BIZ, S: S,
      send: function (t) { openPanel(); return userSays(t); },
      open: openPanel, close: closePanel,
      pickStars: pickStars,
      saveLead: saveLead, renderInbox: renderInbox,
      getLeads: function () { return leads; },
      clearLeads: function () { leads = []; try { localStorage.removeItem(LEAD_KEY); } catch (e) {} renderInbox(); }
    };
    window.__getLeads = function () { return leads; };
    window.__clearLeads = function () { leads = []; try { localStorage.removeItem(LEAD_KEY); } catch (e) {} renderInbox(); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
