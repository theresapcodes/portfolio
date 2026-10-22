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
  var cardBox = card.querySelector('.peek__card');
  var go = card.querySelector('.peek__go');
  var labelEl = card.querySelector('.peek__label');
  var titleEl = card.querySelector('.peek__title');
  var W = 320, GAP = 14, MARGIN = 12, EASE = reduceMotion ? 1 : 0.18;
  var NUDGE_LIFT = 56;                    // the nudge sits a little above the link's line

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
    if (nudging && nudgeX !== null) {
      // the nudge rests in the empty space to the right of the text, level with the link, so it covers no copy
      var sy = Math.max(MARGIN, Math.min(window.innerHeight - h - MARGIN, r.top + r.height / 2 - h / 2 - NUDGE_LIFT));
      card.classList.remove('is-below');
      card.classList.add('is-side');
      curX = nudgeX;
      card.style.transform = 'translate3d(' + nudgeX.toFixed(1) + 'px,' + Math.round(sy) + 'px,0)';
      return;
    }
    card.classList.remove('is-side');
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
      img.setAttribute('alt', link.getAttribute('data-peek-alt') || '');
      if (go) go.setAttribute('href', link.getAttribute('href'));
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
        cancelNudge();
        px = e.clientX; py = e.clientY;
        clearTimeout(hideTimer); clearTimeout(showTimer);
        warm(link);
        showTimer = setTimeout(function () { show(link); }, 110);
      });
      link.addEventListener('mousemove', function (e) { px = e.clientX; py = e.clientY; });
      link.addEventListener('mouseleave', function () { clearTimeout(showTimer); hideTimer = setTimeout(hide, 60); });
    }
    link.addEventListener('focus', function () {
      cancelNudge();
      if (!link.matches(':focus-visible')) return;     // keyboard focus only, not a click
      var r = link.getBoundingClientRect();
      px = r.left + r.width / 2; py = r.top + r.height / 2;
      show(link);
    });
    link.addEventListener('blur', hide);
    link.addEventListener('click', function () { cancelNudge(); hide(); });
  });

  // ---- one-time nudge: when the featured link's paragraph is mostly in view, show its preview for a moment
  //      (once per session), so visitors learn the link has one. Hover, focus, click or scrolling away cancels it.
  var NUDGE_KEY = 'peek-nudged';
  var hoverOk = window.matchMedia && window.matchMedia('(hover: hover)').matches;
  var nudgeLink = links[0];
  var nudgeTimer = null, holdTimer = null, nudging = false, nudgedThisPage = false, nudgeX = null;

  function nudgeSeen() {
    if (nudgedThisPage) return true;
    try { return sessionStorage.getItem(NUDGE_KEY) === '1'; } catch (e) { return false; }
  }
  function markNudged() {
    nudgedThisPage = true;
    try { sessionStorage.setItem(NUDGE_KEY, '1'); } catch (e) { /* storage blocked: the page flag still stops repeats */ }
  }
  function endNudge() {
    clearTimeout(holdTimer);
    nudging = false; nudgeX = null;
    card.classList.remove('is-on');
    active = null;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (!active) { card.hidden = true; card.classList.remove('is-nudge'); } }, 340);
  }
  // visitor took over (hover, focus, click) or the link left the screen
  function cancelNudge() {
    clearTimeout(nudgeTimer); nudgeTimer = null;
    if (!nudging) return;
    clearTimeout(holdTimer);
    nudging = false; nudgeX = null;
    card.classList.remove('is-nudge');      // normal hover timing from here on
  }
  // the nudged thumbnail is clickable: while the pointer is on it, hold it open; a moment after it leaves, let it go
  if (cardBox) {
    cardBox.addEventListener('mouseenter', function () { if (nudging) clearTimeout(holdTimer); });
    cardBox.addEventListener('mouseleave', function () {
      if (!nudging) return;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(endNudge, 700);
    });
  }
  function playNudge() {
    nudgeTimer = null;
    if (nudgeSeen() || nudging || active || nudgeLink.matches(':hover') || document.activeElement === nudgeLink) return;
    var rects = nudgeLink.getClientRects();
    var r = rects.length ? rects[0] : nudgeLink.getBoundingClientRect();
    px = r.left + r.width / 2; py = r.top + r.height / 2;
    // no cursor to follow: rest beside the text column if there is room there, otherwise tucked to the right edge
    var col = nudgeLink.closest('.home__intro');
    var sideX = (col ? col.getBoundingClientRect().right : r.right) + 24;
    if (sideX + W + MARGIN <= window.innerWidth) nudgeX = sideX;
    else { nudgeX = null; px = window.innerWidth; }
    markNudged();
    nudging = true;
    card.classList.add('is-nudge');
    show(nudgeLink);
    holdTimer = setTimeout(endNudge, 300 + 2000);                // ~300ms fade in, then hold ~2s, then fade out
  }

  if (nudgeLink && hoverOk && !reduceMotion && !nudgeSeen() && 'IntersectionObserver' in window) {
    var holder = nudgeLink.closest('p') || nudgeLink;
    var io = new IntersectionObserver(function (entries) {
      var e = entries[entries.length - 1];
      if (e.intersectionRatio >= 0.6) {
        if (nudgeTimer || nudging || nudgeSeen()) return;
        // about 800ms after it comes into view, but not while the page's own entrance animation is still running
        var wait = Math.max(800, 1600 - performance.now());
        nudgeTimer = setTimeout(playNudge, wait);
      } else {
        // scrolled away: drop the pending nudge, or hide it right now if it is on screen
        var wasNudging = nudging;
        cancelNudge();
        if (wasNudging) { hide(); card.classList.remove('is-nudge'); }
      }
    }, { threshold: [0, 0.6] });
    io.observe(holder);
  }
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

  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // the bird also brings in the photograph (the brighter, sunlit page) and takes it away again
  function applyLook() {
    if (on) root.dataset.bg = 'photo'; else delete root.dataset.bg;
  }
  // The photograph is fetched and decoded before the switch starts, so the dissolve fades to a finished picture
  // instead of an empty frame that then pops in. It is warmed up as soon as the speaker button is approached.
  var photoReady = null;
  function preloadPhoto() {
    if (photoReady) return photoReady;
    var img = new Image();
    img.src = 'Assets/home/reference-photo' + ((window.devicePixelRatio || 1) >= 1.5 ? '@2x' : '') + '.jpg';
    photoReady = (img.decode ? img.decode() : new Promise(function (r) { img.onload = img.onerror = r; })).catch(function () {});
    return photoReady;
  }
  ['pointerenter', 'focus', 'touchstart'].forEach(function (evt) { btn.addEventListener(evt, preloadPhoto, { passive: true }); });

  function switchLook() {
    var already = (root.dataset.bg === 'photo') === on;
    if (already) return;
    if (reduceMotion) { applyLook(); return; }
    if (on) {   // heading for the photo: give it a moment (never long) to be ready first
      Promise.race([preloadPhoto(), new Promise(function (r) { setTimeout(r, 900); })]).then(runSwitch);
    } else {
      runSwitch();
    }
  }
  function runSwitch() {
    if ((root.dataset.bg === 'photo') === on) return;     // already in the right look by now
    if (document.startViewTransition) {
      document.startViewTransition(applyLook);
      setTimeout(function () { if ((root.dataset.bg === 'photo') !== on) applyLook(); }, 1800);   // if a browser stalls the transition
    } else {
      var veil = document.createElement('div');
      veil.className = 'theme-veil';
      document.body.appendChild(veil);
      void veil.offsetWidth;
      veil.classList.add('is-on');
      setTimeout(function () {
        applyLook();
        veil.classList.remove('is-on');
        setTimeout(function () { veil.remove(); }, 650);
      }, 320);
    }
  }

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
  // The icon only shows "on" (no slash) while the sound really is playing. If the browser refuses to start
  // audio without a tap, fall back to the off look and start at the visitor's first tap or key press.
  function degrade() {
    if (!on) return;
    on = false; pending = true; setUi(); switchLook(); armFirstGesture();
  }
  function start() {
    // iPhones keep Web Audio silent while the ringer switch is off unless the page asks for a "playback" session
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* unsupported */ }
    engine();
    // phones only unlock audio from inside a tap: resume the engine and play one silent sample right away
    try {
      var blip = ctx.createBufferSource();
      blip.buffer = ctx.createBuffer(1, 1, 22050);
      blip.connect(ctx.destination);
      blip.start(0);
    } catch (e) { /* not needed everywhere */ }
    var resumed = ctx.state !== 'running' ? ctx.resume() : Promise.resolve();
    var settled = Promise.race([resumed.catch(function () {}), new Promise(function (r) { setTimeout(r, 800); })]);
    return Promise.all([load(), settled]).then(function (res) {
      var b = res[0];
      if (!on) return;
      if (ctx.state !== 'running' && !document.hidden) { degrade(); return; }
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
    }).catch(function () { on = false; setUi(); remember(); switchLook(); });   // could not load: back to off, and back to green
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
    switchLook();
    if (on) start(); else stop();
  });

  // quiet when the tab is in the background; if audio will not come back when the tab does, show off
  document.addEventListener('visibilitychange', function () {
    if (!ctx || !on) return;
    if (document.hidden) { ctx.suspend(); return; }
    var back = ctx.resume();
    setTimeout(function () { if (on && !document.hidden && ctx.state !== 'running') degrade(); }, 900);
    if (back && back.catch) back.catch(function () {});
  });

  // a remembered "on": start straight away where the browser allows sound, otherwise show off (slashed) and
  // start at the visitor's first tap, click or key press. A tap on a link or on the bird itself does not count.
  var firstArmed = false;
  function first(e) {
    if (!(on === false && pending)) return;
    var t = e && e.target;
    if (t && t.closest && (t.closest('a') || t.closest('.home-sound'))) return;
    document.removeEventListener('click', first, true);
    document.removeEventListener('keydown', first, true);
    firstArmed = false;
    on = true; pending = false;
    setUi(); switchLook(); start();
  }
  function armFirstGesture() {
    if (firstArmed) return;
    firstArmed = true;
    document.addEventListener('click', first, true);     // a finished tap: phones do not count a finger-down as permission
    document.addEventListener('keydown', first, true);
  }
  var saved = null;
  try { saved = localStorage.getItem('home-sound'); } catch (e) { /* storage blocked */ }
  if (saved === 'on') {
    var allowed = false;
    try { allowed = !!(navigator.getAutoplayPolicy && navigator.getAutoplayPolicy('audiocontext') === 'allowed'); } catch (e) { /* unsupported */ }
    if (allowed) { on = true; setUi(); switchLook(); start(); }
    else { pending = true; armFirstGesture(); }
  }
  setUi();
})();

/* Signature: its write-on animation runs inside the image, so it used to play at page load, out of sight, when it sits
   below the first screen (phones). Hold the image back until it is on screen, then let it write itself out there. */
(function () {
  'use strict';
  var sig = document.querySelector('.signature');
  if (!sig || !('IntersectionObserver' in window)) return;
  var src = sig.getAttribute('src');
  if (!src) return;
  var r = sig.getBoundingClientRect();
  if (r.top < window.innerHeight * 0.9) return;          // already on screen at load: it writes itself right away
  sig.removeAttribute('src');
  var io = new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    sig.setAttribute('src', src);
  }, { threshold: 0.25 });
  io.observe(sig);
})();

/* Testimonials: one at a time, a slow cross-fade. Pauses while hovered, focused or when the tab is hidden, and
   stays on the first one for visitors who prefer reduced motion. */
(function () {
  'use strict';
  var box = document.querySelector('.voices');
  if (!box) return;
  var items = Array.prototype.slice.call(box.querySelectorAll('.voices__item'));
  if (items.length < 2) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var i = 0, timer = null, held = false;

  function show(n) {
    items[i].classList.remove('is-active');
    items[i].setAttribute('aria-hidden', 'true');
    i = n;
    items[i].classList.add('is-active');
    items[i].removeAttribute('aria-hidden');
  }
  function tick() { if (!held && !document.hidden) show((i + 1) % items.length); }
  function start() { if (!timer) timer = setInterval(tick, 8000); }
  function stop() { clearInterval(timer); timer = null; }

  box.addEventListener('mouseenter', function () { held = true; });
  box.addEventListener('mouseleave', function () { held = false; });
  box.addEventListener('focusin', function () { held = true; });
  box.addEventListener('focusout', function () { held = false; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  setTimeout(start, 3000);
})();
