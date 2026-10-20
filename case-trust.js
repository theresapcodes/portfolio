/* Case study concept: segmented-control switchers + scroll-play videos */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var videos = Array.prototype.slice.call(document.querySelectorAll('main video'));

  // ---- poster frames load as you approach them, not all at page load -------------------
  // (they were ~1.9 MB at the start, queued ahead of the page's own script; the images themselves are unchanged)
  function setPoster(v) {
    if (!v.getAttribute('data-poster')) return;
    v.poster = v.getAttribute('data-poster');
    v.removeAttribute('data-poster');
  }
  (function () {
    var pending = videos.filter(function (v) { return v.getAttribute('data-poster'); });
    if (!('IntersectionObserver' in window)) { pending.forEach(setPoster); return; }
    var posterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        setPoster(entry.target);
        posterObserver.unobserve(entry.target);
      });
    }, { rootMargin: '1200px' });   // all four sides: carousel slides wait off to the side
    pending.forEach(function (v) { posterObserver.observe(v); });
    // Once the page has settled, quietly fetch the rest (nearest first, two at a time) so no video box is ever
    // blank by the time you scroll or jump to it. The first paint is still just what is near the top.
    function warm(url) {
      return new Promise(function (resolve) {
        var im = new Image();
        im.onload = im.onerror = resolve;
        im.src = url;
      });
    }
    function fetchRest() {
      var mid = window.innerHeight / 2;
      var queue = pending.filter(function (v) { return v.getAttribute('data-poster'); });
      queue.sort(function (a, b) {
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return Math.abs(ra.top + ra.height / 2 - mid) - Math.abs(rb.top + rb.height / 2 - mid);
      });
      function next() {
        var v = queue.shift();
        if (!v) return;
        var url = v.getAttribute('data-poster');
        if (!url) { next(); return; }
        warm(url).then(function () { setPoster(v); posterObserver.unobserve(v); next(); });
      }
      next(); next();
    }
    function later() {
      setTimeout(function () {
        if ('requestIdleCallback' in window) requestIdleCallback(fetchRest, { timeout: 3000 }); else fetchRest();
      }, 600);
    }
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later);
  })();

  // ---- play / pause by visibility --------------------------------------------------
  var inView = new Set();

  function startVideo(video) {
    if (reduceMotion) return;
    var p = video.play();
    if (p !== undefined) {
      p.catch(function (err) {
        // Autoplay refused (Low Power Mode, data saver): hand the visitor the native controls.
        if (err && err.name === 'NotAllowedError') video.controls = true;
      });
    }
  }

  videos.forEach(function (video) {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.addEventListener('playing', function () { video.controls = false; });
    if (reduceMotion) video.controls = true;
  });

  if ('IntersectionObserver' in window && !reduceMotion) {
    var playObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var video = entry.target;
        var visible = entry.isIntersecting &&
          (entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= window.innerHeight * 0.5);
        if (visible) {
          inView.add(video);
          startVideo(video);
        } else {
          inView.delete(video);
          if (!video.paused) video.pause();
        }
      });
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });

    var preloadObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        if (entry.target.preload === 'none') entry.target.preload = 'metadata';
        preloadObserver.unobserve(entry.target);
      });
    }, { rootMargin: '600px 0px' });

    videos.forEach(function (video) {
      playObserver.observe(video);
      preloadObserver.observe(video);
    });

    // A first touch counts as a gesture on phones, so retry anything that was refused.
    ['touchend', 'click'].forEach(function (evt) {
      window.addEventListener(evt, function () {
        inView.forEach(function (video) { if (video.paused) startVideo(video); });
      }, { passive: true });
    });
  }

  // ---- reveal on scroll (same behavior as the live site) ----------------------------
  var revealEls = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(function (el) {
      // Anything already on screen at load reveals immediately, so there is no blank flash.
      var rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        // next frame so the hidden state paints first and the transition runs
        requestAnimationFrame(function () { el.classList.add('is-visible'); });
      } else {
        revealObserver.observe(el);
      }
    });
  }

  // ---- approach table: questions reveal one at a time as you scroll ------------------
  var rows = Array.prototype.slice.call(document.querySelectorAll('[data-row]'));
  if (reduceMotion || !('IntersectionObserver' in window)) {
    rows.forEach(function (row) { row.classList.add('is-visible'); });
  } else if (rows.length) {
    var rowObserver = new IntersectionObserver(function (entries) {
      // rows that arrive together (tall screens) still play in order, one after another
      var batch = entries.filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return rows.indexOf(a.target) - rows.indexOf(b.target); });
      batch.forEach(function (entry, k) {
        entry.target.style.setProperty('--d', (k * 700) + 'ms');
        entry.target.classList.add('is-visible');
        rowObserver.unobserve(entry.target);
      });
    }, { threshold: 0.9, rootMargin: '0px 0px -12% 0px' });
    rows.forEach(function (row) { rowObserver.observe(row); });
  }

  // ---- count-up for the results percentages ------------------------------------------
  var counters = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
  function parseStat(text) {
    var m = text.match(/^([\d.]+)(.*)$/);
    if (!m) return null;
    return { value: parseFloat(m[1]), decimals: (m[1].split('.')[1] || '').length, suffix: m[2] };
  }
  function countUp(el, target) {
    var duration = 1200;
    var start = performance.now();
    function step(now) {
      var progress = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = (target.value * eased).toFixed(target.decimals) + target.suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if (counters.length && !reduceMotion && 'IntersectionObserver' in window) {
    var counterObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseStat(el.textContent.trim());
        if (target) {
          el.setAttribute('aria-label', el.textContent.trim());
          el.textContent = (0).toFixed(target.decimals) + target.suffix;
          countUp(el, target);
        }
        obs.unobserve(el);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { counterObserver.observe(el); });
  }

  // ---- pull quote cycler: a new quote every 3.5 seconds ------------------------------
  Array.prototype.forEach.call(document.querySelectorAll('[data-quote-cycle]'), function (root) {
    var quotes = Array.prototype.slice.call(root.querySelectorAll('.quote'));
    if (quotes.length < 2 || reduceMotion) return;   // reduced motion keeps the first quote still
    var index = 0;
    var timer = null;
    var paused = false;
    var visible = false;

    function show(next) {
      quotes[index].classList.remove('is-active');
      quotes[index].setAttribute('aria-hidden', 'true');
      index = next;
      quotes[index].classList.add('is-active');
      quotes[index].removeAttribute('aria-hidden');
    }
    function tick() { show((index + 1) % quotes.length); }
    function sync() {
      var shouldRun = visible && !paused && !document.hidden;
      if (shouldRun && !timer) timer = setInterval(tick, 3500);
      if (!shouldRun && timer) { clearInterval(timer); timer = null; }
    }

    root.addEventListener('mouseenter', function () { paused = true; sync(); });
    root.addEventListener('mouseleave', function () { paused = false; sync(); });
    document.addEventListener('visibilitychange', sync);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        sync();
      }, { threshold: 0.3 }).observe(root);
    } else {
      visible = true;
      sync();
    }
  });

  // ---- "The call" stroke draws down as you scroll ------------------------------------
  var calls = Array.prototype.slice.call(document.querySelectorAll('.call'));
  if (calls.length && !reduceMotion && 'IntersectionObserver' in window) {
    var active = new Set();
    var ticking = false;

    function update() {
      ticking = false;
      var vh = window.innerHeight;
      active.forEach(function (el) {
        var top = el.getBoundingClientRect().top;
        // starts drawing as the block enters the lower part of the screen, finished by mid-screen
        var p = (vh * 0.88 - top) / (vh * 0.38);
        el.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));
      });
    }
    function request() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }

    var callObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) active.add(entry.target); else active.delete(entry.target);
      });
      request();
    }, { rootMargin: '0px 0px 0px 0px', threshold: [0, 1] });

    calls.forEach(function (el) {
      el.style.setProperty('--p', '0');
      callObserver.observe(el);
    });
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    request();
  }

  // ---- carousel: swipe or tap between videos --------------------------------------------
  Array.prototype.forEach.call(document.querySelectorAll('[data-carousel]'), function (root) {
    var track = root.querySelector('.carousel__track');
    var slides = Array.prototype.slice.call(root.querySelectorAll('.carousel__slide'));
    var prev = root.querySelector('.carousel__btn--prev');
    var next = root.querySelector('.carousel__btn--next');
    var dots = Array.prototype.slice.call(root.querySelectorAll('.carousel__dot'));
    var current = 0;

    function goTo(i) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: i * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    function setCurrent(i) {
      if (i === current) return;
      current = i;
      render();
      // start the slide you just landed on from the top
      var v = slides[i].querySelector('video');
      if (v) { try { v.currentTime = 0; } catch (e) { /* not seekable yet */ } }
    }
    var scope = root.closest('[data-caption-scope]');
    var captions = scope ? Array.prototype.slice.call(scope.querySelectorAll('[data-caption-index]')) : [];
    function render() {
      captions.forEach(function (cap) { cap.hidden = Number(cap.dataset.captionIndex) !== current; });
      prev.hidden = current === 0;
      next.hidden = current === slides.length - 1;
      dots.forEach(function (d, k) {
        d.classList.toggle('is-active', k === current);
        if (k === current) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
    }

    var raf = null;
    track.addEventListener('scroll', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        setCurrent(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
      });
    }, { passive: true });
    window.addEventListener('resize', function () {
      track.scrollTo({ left: current * track.clientWidth, behavior: 'auto' });
    });

    prev.addEventListener('click', function () { goTo(current - 1); });
    next.addEventListener('click', function () { goTo(current + 1); });
    dots.forEach(function (d, k) { d.addEventListener('click', function () { goTo(k); }); });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
    });
    render();
  });

  // ---- theme toggle (light / dark), remembered between visits ---------------------------
  (function () {
    var btn = document.querySelector('.cs-theme');
    if (!btn) return;
    var root = document.documentElement;
    function sync() {
      var dark = root.dataset.theme === 'dark';
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    btn.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      if (next === 'dark') root.dataset.theme = 'dark'; else delete root.dataset.theme;
      try { localStorage.setItem('cs-theme', next); } catch (e) { /* storage blocked */ }
      sync();
    });
    sync();
  })();

  // ---- floating dock: headshot opens an "On this page" menu with scroll-spy ------------
  (function () {
    var btn = document.querySelector('.cs-dock__nav');
    var toc = document.getElementById('cs-toc');
    if (!btn || !toc) return;
    var open = false;

    function setOpen(next, returnFocus) {
      open = next;
      btn.setAttribute('aria-expanded', String(open));
      if (open) {
        toc.hidden = false;
        requestAnimationFrame(function () { toc.classList.add('is-open'); });
      } else {
        toc.classList.remove('is-open');
        setTimeout(function () { if (!open) toc.hidden = true; }, reduceMotion ? 0 : 200);
        if (returnFocus) btn.focus();
      }
    }
    btn.addEventListener('click', function () { setOpen(!open); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) setOpen(false, true); });
    document.addEventListener('click', function (e) {
      if (open && !toc.contains(e.target) && !btn.contains(e.target)) setOpen(false);
    });
    toc.addEventListener('click', function (e) {
      if (e.target.closest('a[href^="#"]')) setOpen(false);
    });

    // highlight the section you are reading
    var links = {};
    Array.prototype.forEach.call(toc.querySelectorAll('[data-spy]'), function (a) { links[a.dataset.spy] = a; });
    var current = null;
    function mark(id) {
      if (id === current) return;
      current = id;
      Object.keys(links).forEach(function (k) {
        var on = k === id;
        links[k].classList.toggle('is-current', on);
        if (on) links[k].setAttribute('aria-current', 'location'); else links[k].removeAttribute('aria-current');
      });
    }
    if ('IntersectionObserver' in window) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { if (entry.isIntersecting) mark(entry.target.id); });
      }, { rootMargin: '-35% 0px -60% 0px' });
      Object.keys(links).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) spy.observe(el);
      });
    }
    mark('overview');
  })();

  // ---- dock avatar: opens the profile card above the dock, growing up out of the avatar with a spring ---
  (function () {
    var btn = document.querySelector('.cs-dock__me');
    var menu = document.getElementById('cs-profile-menu');
    var scrim = document.querySelector('[data-cs-scrim]');
    if (!btn || !menu) return;
    var open = false, anim = null, ready = false, readyPromise = null, scrimTimer = null;

    // slightly under-damped spring written as a CSS linear() easing (cubic-bezier fallback)
    function springEasing() {
      var zeta = 0.76, w0 = 20.6, wd = w0 * Math.sqrt(1 - zeta * zeta), dur = 0.62, n = 48, pts = [];
      for (var i = 0; i <= n; i++) {
        var t = (i / n) * dur;
        var x = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
        pts.push(i === n ? 1 : +x.toFixed(4));
      }
      var easing = 'linear(' + pts.join(', ') + ')';
      return (window.CSS && CSS.supports && CSS.supports('animation-timing-function', easing)) ? easing : 'cubic-bezier(0.34, 1.26, 0.64, 1)';
    }
    var SPRING = springEasing();

    // decode the card's images before the first open so nothing pops in mid-animation
    function whenReady() {
      if (ready) return null;
      if (!readyPromise) {
        var imgs = Array.prototype.slice.call(menu.querySelectorAll('img'));
        var decoded = Promise.all(imgs.map(function (img) { return img.decode ? img.decode().catch(function () {}) : Promise.resolve(); }))
          .then(function () { ready = true; });
        readyPromise = Promise.race([decoded, new Promise(function (r) { setTimeout(r, 300); })]);
      }
      return readyPromise;
    }
    if (document.readyState === 'complete') whenReady(); else window.addEventListener('load', whenReady);

    function currentHeight() { return menu.getBoundingClientRect().height; }
    function stop() { if (anim) { anim.cancel(); anim = null; } }
    function showScrim() {
      if (!scrim) return;
      clearTimeout(scrimTimer); scrim.hidden = false; void scrim.offsetWidth; scrim.classList.add('is-on');
    }
    function hideScrim() {
      if (!scrim) return;
      scrim.classList.remove('is-on');
      scrimTimer = setTimeout(function () { if (!open) scrim.hidden = true; }, reduceMotion ? 0 : 260);
    }
    function grow() {
      if (!open) return;
      var from = menu.hidden ? 0 : currentHeight();
      stop(); menu.hidden = false; menu.style.height = '';
      var full = menu.scrollHeight;
      if (reduceMotion || !menu.animate) return;
      anim = menu.animate(
        [{ height: from + 'px', opacity: from ? 1 : 0 }, { height: from + 'px', opacity: 1, offset: 0.06 }, { height: full + 'px', opacity: 1 }],
        { duration: 620, easing: SPRING, fill: 'both' }
      );
      var mine = anim;
      mine.onfinish = function () { if (anim === mine) { mine.cancel(); anim = null; } };
      setTimeout(function () { if (anim === mine) { mine.cancel(); anim = null; } }, 700);
    }
    function hide() {
      var from = menu.hidden ? 0 : currentHeight();
      stop();
      if (reduceMotion || !menu.animate || menu.hidden) { menu.hidden = true; return; }
      anim = menu.animate([{ height: from + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'both' });
      var mine = anim;
      function done() { if (anim !== mine) return; mine.cancel(); anim = null; if (!open) menu.hidden = true; }
      mine.onfinish = done; setTimeout(done, 280);
    }
    function setOpen(next, returnFocus) {
      open = next; btn.setAttribute('aria-expanded', String(open));
      if (open) { showScrim(); var wait = whenReady(); if (wait) wait.then(grow); else grow(); }
      else { hideScrim(); hide(); if (returnFocus) btn.focus(); }
    }
    btn.addEventListener('click', function () { setOpen(!open); });
    if (scrim) scrim.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) setOpen(false, true); });
    // any click outside the card and its avatar closes it (this includes opening the "On this page" menu)
    document.addEventListener('click', function (e) { if (open && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false); });
  })();

  // ---- segmented control + panels ---------------------------------------------------
  Array.prototype.forEach.call(document.querySelectorAll('[data-switcher]'), function (root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = Array.prototype.slice.call(root.querySelectorAll('[role="tabpanel"]'));
    if (tabs.length < 2) return;

    function select(view, focus) {
      tabs.forEach(function (tab) {
        var active = tab.dataset.view === view;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active && focus) tab.focus();
      });
      Array.prototype.forEach.call(root.querySelectorAll('[data-caption]'), function (cap) {
        cap.hidden = cap.dataset.caption !== view;
      });
      panels.forEach(function (panel) {
        var active = panel.dataset.view === view;
        var video = panel.querySelector('video');
        if (active) {
          panel.hidden = false;
          if (video) {
            if (video.preload === 'none') video.preload = 'auto';
            try { video.currentTime = 0; } catch (e) { /* not seekable yet */ }
          }
        } else {
          panel.hidden = true;
          if (video && !video.paused) video.pause();
        }
      });
    }

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { select(tab.dataset.view, false); });
      tab.addEventListener('keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
        if (event.key === 'Home') next = tabs[0];
        if (event.key === 'End') next = tabs[tabs.length - 1];
        if (!next) return;
        event.preventDefault();
        select(next.dataset.view, true);
      });
    });
  });
})();
