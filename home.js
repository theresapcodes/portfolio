/* Home (concept): the profile button opens the menu card */
(function () {
  'use strict';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.querySelector('[data-profile]');
  if (!root) return;
  var btn = root.querySelector('.profile__btn');
  var menu = root.querySelector('.menu');
  var open = false;

  function setOpen(next, returnFocus) {
    open = next;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(function () { menu.classList.add('is-open'); });
    } else {
      menu.classList.remove('is-open');
      setTimeout(function () { if (!open) menu.hidden = true; }, reduceMotion ? 0 : 200);
      if (returnFocus) btn.focus();
    }
  }

  btn.addEventListener('click', function () { setOpen(!open); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) setOpen(false, true); });
  document.addEventListener('click', function (e) { if (open && !root.contains(e.target)) setOpen(false); });
})();
