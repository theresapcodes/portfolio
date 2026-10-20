/* Home (concept): the profile button grows the menu card out of itself with a spring */
(function () {
  'use strict';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.querySelector('[data-profile]');
  if (!root) return;
  var btn = root.querySelector('.profile__btn');
  var menu = root.querySelector('.menu');
  var scrim = root.querySelector('[data-scrim]');
  var open = false;
  var anim = null;
  var scrimTimer = null;

  // A slightly under-damped spring (about 2.6% overshoot, settled in ~0.6s), written out as a CSS
  // linear() easing so the browser runs it. Falls back to a close cubic-bezier where linear() is missing.
  function springEasing() {
    var zeta = 0.76, w0 = 20.6, wd = w0 * Math.sqrt(1 - zeta * zeta), dur = 0.62, n = 48, pts = [];
    for (var i = 0; i <= n; i++) {
      var t = (i / n) * dur;
      var x = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
      pts.push(i === n ? 1 : +x.toFixed(4));
    }
    var easing = 'linear(' + pts.join(', ') + ')';
    return (window.CSS && CSS.supports && CSS.supports('animation-timing-function', easing))
      ? easing : 'cubic-bezier(0.34, 1.26, 0.64, 1)';
  }
  var SPRING = springEasing();

  // The menu's photo and icons sit in a hidden element, so the browser would not decode or draw
  // them until the first open, and that work would land in the middle of the animation. Decode
  // them up front instead, and only start the animation once they are ready (never waiting long).
  var ready = false;
  var readyPromise = null;
  function whenReady() {
    if (ready) return null;
    if (!readyPromise) {
      var imgs = Array.prototype.slice.call(menu.querySelectorAll('img'));
      var decoded = Promise.all(imgs.map(function (img) {
        return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
      })).then(function () { ready = true; });
      var giveUp = new Promise(function (resolve) { setTimeout(resolve, 300); });
      readyPromise = Promise.race([decoded, giveUp]);
    }
    return readyPromise;
  }
  if (document.readyState === 'complete') whenReady();
  else window.addEventListener('load', whenReady);

  function currentHeight() { return menu.getBoundingClientRect().height; }
  function stop() { if (anim) { anim.cancel(); anim = null; } }

  function showScrim() {
    if (!scrim) return;
    clearTimeout(scrimTimer);
    scrim.hidden = false;
    void scrim.offsetWidth;                 // let the browser register the start state, then fade in
    scrim.classList.add('is-on');
  }
  function hideScrim() {
    if (!scrim) return;
    scrim.classList.remove('is-on');
    scrimTimer = setTimeout(function () { if (!open) scrim.hidden = true; }, reduceMotion ? 0 : 260);
  }

  function grow() {
    if (!open) return;
    var from = menu.hidden ? 0 : currentHeight();
    stop();
    menu.hidden = false;
    menu.style.height = '';
    var full = menu.scrollHeight;
    if (reduceMotion || !menu.animate) return;
    anim = menu.animate(
      [
        { height: from + 'px', opacity: from ? 1 : 0 },
        { height: from + 'px', opacity: 1, offset: 0.06 },
        { height: full + 'px', opacity: 1 }
      ],
      { duration: 620, easing: SPRING, fill: 'both' }
    );
    var mine = anim;
    mine.onfinish = function () { if (anim === mine) { mine.cancel(); anim = null; } };
    // finish events can be delayed in a throttled tab; make sure the card returns to its natural height
    setTimeout(function () { if (anim === mine) { mine.cancel(); anim = null; } }, 700);
  }

  function show() {
    showScrim();
    var wait = whenReady();
    if (wait) wait.then(grow); else grow();
  }

  function hide() {
    hideScrim();
    var from = menu.hidden ? 0 : currentHeight();
    stop();
    if (reduceMotion || !menu.animate || menu.hidden) { menu.hidden = true; return; }
    anim = menu.animate(
      [{ height: from + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
      { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'both' }
    );
    var mine = anim;
    function done() {
      if (anim !== mine) return;
      mine.cancel(); anim = null;
      if (!open) menu.hidden = true;
    }
    mine.onfinish = done;
    setTimeout(done, 280);
  }

  function setOpen(next, returnFocus) {
    open = next;
    btn.setAttribute('aria-expanded', String(open));
    if (open) show(); else { hide(); if (returnFocus) btn.focus(); }
  }

  btn.addEventListener('click', function () { setOpen(!open); });
  if (scrim) scrim.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) setOpen(false, true); });
  document.addEventListener('click', function (e) { if (open && !root.contains(e.target)) setOpen(false); });
})();

/* Link preview: hovering (or keyboard-focusing) a link marked data-peek floats a small preview card.
   - appears after a short pause (~110ms) so sweeping the pointer across text does not flicker
   - sits above the link, follows the pointer sideways with a little easing, flips below near the top
   - never intercepts the pointer, so the link stays clickable
   - mouse and keyboard only: on touch screens a tap simply opens the page
   - the image is fetched and decoded up front so the card never pops in half drawn */
(function () {
  'use strict';
  var card = document.querySelector('.peek');
  var links = Array.prototype.slice.call(document.querySelectorAll('[data-peek]'));
  if (!card || !links.length) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mouseOk = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var img = card.querySelector('.peek__img');
  var labelEl = card.querySelector('.peek__label');
  var titleEl = card.querySelector('.peek__title');
  var W = 320, GAP = 14, MARGIN = 12, EASE = reduceMotion ? 1 : 0.18;

  var active = null, showTimer = null, hideTimer = null, raf = null;
  var px = 0, py = 0, curX = null;
  var warmed = {};

  function warm(link) {
    var src = link.getAttribute('data-peek-img');
    if (!src) return Promise.resolve();
    if (!warmed[src]) {
      var pre = new Image();
      pre.src = src;
      warmed[src] = pre.decode ? pre.decode().catch(function () {}) : Promise.resolve();
    }
    return warmed[src];
  }
  function warmAll() { links.forEach(warm); }
  function whenIdle() {
    if ('requestIdleCallback' in window) requestIdleCallback(warmAll, { timeout: 2500 });
    else setTimeout(warmAll, 1500);
  }
  if (document.readyState === 'complete') whenIdle(); else window.addEventListener('load', whenIdle);

  // links can wrap onto two lines; use the line under the pointer
  function lineRect(link) {
    var rects = link.getClientRects();
    if (!rects.length) return link.getBoundingClientRect();
    for (var i = 0; i < rects.length; i++) {
      if (py >= rects[i].top - 2 && py <= rects[i].bottom + 2) return rects[i];
    }
    return rects[0];
  }

  function place(first) {
    if (!active) return;
    var r = lineRect(active);
    var h = card.offsetHeight;
    var targetX = Math.max(MARGIN, Math.min(window.innerWidth - W - MARGIN, px - W / 2));
    var y = r.top - h - GAP;
    var below = y < MARGIN;
    if (below) y = r.bottom + GAP;
    card.classList.toggle('is-below', below);
    curX = (first || curX === null) ? targetX : curX + (targetX - curX) * EASE;
    card.style.transform = 'translate3d(' + curX.toFixed(1) + 'px,' + Math.round(y) + 'px,0)';
  }
  function loop() {
    place(false);
    raf = active ? requestAnimationFrame(loop) : null;
  }

  function show(link) {
    clearTimeout(hideTimer);
    if (active === link && card.classList.contains('is-on')) return;
    active = link;
    warm(link).then(function () {
      if (active !== link) return;
      var src = link.getAttribute('data-peek-img');
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      labelEl.textContent = link.getAttribute('data-peek-label') || '';
      titleEl.textContent = link.getAttribute('data-peek-title') || '';
      card.hidden = false;
      curX = null;
      place(true);
      void card.offsetWidth;                // register the start state so the entrance transition runs
      card.classList.add('is-on');
      if (!raf) raf = requestAnimationFrame(loop);
    });
  }

  function hide() {
    clearTimeout(showTimer);
    active = null;
    card.classList.remove('is-on');
    hideTimer = setTimeout(function () { if (!active) card.hidden = true; }, reduceMotion ? 140 : 280);
  }

  links.forEach(function (link) {
    if (mouseOk) {
      link.addEventListener('mouseenter', function (e) {
        px = e.clientX; py = e.clientY;
        clearTimeout(hideTimer); clearTimeout(showTimer);
        warm(link);
        showTimer = setTimeout(function () { show(link); }, 110);
      });
      link.addEventListener('mousemove', function (e) { px = e.clientX; py = e.clientY; });
      link.addEventListener('mouseleave', function () { clearTimeout(showTimer); hideTimer = setTimeout(hide, 60); });
    }
    link.addEventListener('focus', function () {
      if (!link.matches(':focus-visible')) return;     // keyboard focus only, not a click
      var r = link.getBoundingClientRect();
      px = r.left + r.width / 2; py = r.top + r.height / 2;
      show(link);
    });
    link.addEventListener('blur', hide);
    link.addEventListener('click', hide);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && active) hide(); });
  window.addEventListener('blur', hide);
})();


/* Nature sounds: opt-in, since browsers do not allow sound that starts on its own. A short recording of
   birds, cleaned up and joined into a seamless loop, fades in quietly and out again. Played through the
   browser's audio engine (not an audio tag) so the loop has no gap. The choice is remembered. */
(function () {
  'use strict';
  var btn = document.querySelector('.home-sound');
  if (!btn) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { btn.hidden = true; return; }

  var URL_SRC = 'Assets/home/birds-loop.mp3';
  var TARGET = 0.3, FADE_IN = 2.4, FADE_OUT = 1.2;
  var ctx = null, gain = null, source = null, buffer = null, loading = null;
  var on = false, pending = false;

  function setUi() {
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Mute nature sounds' : 'Play nature sounds');
  }
  function remember() { try { localStorage.setItem('home-sound', on ? 'on' : 'off'); } catch (e) { /* storage blocked */ } }
  function engine() {
    if (!ctx) {
      ctx = new AC();
      gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
    }
    return ctx;
  }
  function load() {
    if (buffer) return Promise.resolve(buffer);
    if (!loading) {
      loading = fetch(URL_SRC)
        .then(function (r) { if (!r.ok) throw new Error('audio'); return r.arrayBuffer(); })
        .then(function (data) { return new Promise(function (ok, no) { ctx.decodeAudioData(data, ok, no); }); })
        .then(function (b) { buffer = b; return b; })
        .catch(function (e) { loading = null; throw e; });
    }
    return loading;
  }
  function ramp(to, seconds) {
    var t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(to, t + seconds);
  }
  function start() {
    engine();
    if (ctx.state === 'suspended') ctx.resume();
    return load().then(function (b) {
      if (!on) return;
      if (!source) {
        source = ctx.createBufferSource();
        source.buffer = b;
        source.loop = true;
        source.loopStart = 0.03;                       // stay clear of the encoder's padding
        source.loopEnd = Math.max(b.duration - 0.03, 0.2);
        source.connect(gain);
        source.start(0, 0.03 + Math.random() * Math.max(b.duration - 15, 1));   // a different spot each visit
      }
      ramp(TARGET, FADE_IN);
    }).catch(function () { on = false; setUi(); remember(); });   // could not load: back to off
  }
  function stop() {
    if (!ctx || !gain) return;
    ramp(0, FADE_OUT);
    setTimeout(function () { if (!on && ctx.state === 'running') ctx.suspend(); }, FADE_OUT * 1000 + 100);
  }

  btn.addEventListener('click', function () {
    on = !on;
    pending = false;
    setUi(); remember();
    if (on) start(); else stop();
  });

  // quiet when the tab is in the background
  document.addEventListener('visibilitychange', function () {
    if (!ctx || !on) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  // a remembered "on" shows as on, and starts at the visitor's first tap, click or key press
  var saved = null;
  try { saved = localStorage.getItem('home-sound'); } catch (e) { /* storage blocked */ }
  if (saved === 'on') {
    on = true; pending = true; setUi();
    var first = function () {
      document.removeEventListener('pointerdown', first, true);
      document.removeEventListener('keydown', first, true);
      if (on && pending) { pending = false; start(); }
    };
    document.addEventListener('pointerdown', first, true);
    document.addEventListener('keydown', first, true);
  }
  setUi();
})();
