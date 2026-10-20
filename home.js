/* Home (concept): the profile button grows the menu card out of itself with a spring */
(function () {
  'use strict';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.querySelector('[data-profile]');
  if (!root) return;
  var btn = root.querySelector('.profile__btn');
  var menu = root.querySelector('.menu');
  var open = false;
  var anim = null;

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

  function currentHeight() { return menu.getBoundingClientRect().height; }

  function stop() { if (anim) { anim.cancel(); anim = null; } }

  function show() {
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
  }

  function hide() {
    var from = currentHeight();
    stop();
    if (reduceMotion || !menu.animate) { menu.hidden = true; return; }
    anim = menu.animate(
      [{ height: from + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
      { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'both' }
    );
    var mine = anim;
    mine.onfinish = function () {
      if (anim !== mine) return;
      mine.cancel(); anim = null;
      if (!open) menu.hidden = true;
    };
  }

  function setOpen(next, returnFocus) {
    open = next;
    btn.setAttribute('aria-expanded', String(open));
    if (open) show(); else { hide(); if (returnFocus) btn.focus(); }
  }

  btn.addEventListener('click', function () { setOpen(!open); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) setOpen(false, true); });
  document.addEventListener('click', function (e) { if (open && !root.contains(e.target)) setOpen(false); });
})();
