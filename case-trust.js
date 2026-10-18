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
