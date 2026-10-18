/* Case study concept: segmented-control switchers + scroll-play videos */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var videos = Array.prototype.slice.call(document.querySelectorAll('main video'));

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
