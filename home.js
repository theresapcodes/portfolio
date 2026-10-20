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
