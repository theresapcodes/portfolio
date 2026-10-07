function initTestimonialCycler() {
  const cycler = document.querySelector('.testimonial-cycler');
  if (!cycler) return;

  const items = [...cycler.querySelectorAll('.testimonial-item')];
  if (items.length <= 1) return;

  const intervalMs = 4000;
  const fadeMs = 300;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let index = Math.max(items.findIndex((item) => item.classList.contains('is-active')), 0);
  let timer = null;

  // Reserve height for the tallest quote so switching items never shifts
  // the page content below the section.
  function syncHeight() {
    const width = cycler.getBoundingClientRect().width;
    let maxHeight = 0;
    items.forEach((item) => {
      const prev = { display: item.style.display, position: item.style.position, visibility: item.style.visibility, width: item.style.width };
      item.style.position = 'absolute';
      item.style.visibility = 'hidden';
      item.style.display = 'block';
      item.style.width = width + 'px';
      maxHeight = Math.max(maxHeight, item.getBoundingClientRect().height);
      item.style.display = prev.display;
      item.style.position = prev.position;
      item.style.visibility = prev.visibility;
      item.style.width = prev.width;
    });
    cycler.style.minHeight = maxHeight + 'px';
  }

  syncHeight();
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(syncHeight, 150);
  });

  function show(nextIndex) {
    const current = items[index];
    const next = items[nextIndex];

    if (prefersReducedMotion) {
      current.classList.remove('is-active');
      next.classList.add('is-active');
      index = nextIndex;
      return;
    }

    current.classList.add('is-leaving');
    window.setTimeout(() => {
      current.classList.remove('is-active', 'is-leaving');
      next.classList.add('is-active', 'is-entering');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => next.classList.remove('is-entering'));
      });
      index = nextIndex;
    }, fadeMs);
  }

  function next() {
    show((index + 1) % items.length);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function start() {
    stop();
    timer = window.setInterval(next, intervalMs);
  }

  cycler.addEventListener('mouseenter', stop);
  cycler.addEventListener('mouseleave', start);
  cycler.addEventListener('focusin', stop);
  cycler.addEventListener('focusout', start);

  start();
}

function initScrollReveal() {
  const elements = [...document.querySelectorAll('[data-reveal]')];
  if (!elements.length) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    elements.forEach((el) => el.classList.add('is-visible', 'is-settled'));
    return;
  }

  // Cards (case-card, archive-card) ease up into place on reveal, then hand
  // their transform/box-shadow transition back to the card's own (much
  // quicker) hover transition once settled, so hover afterward isn't sluggish.
  const revealMs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--duration-reveal')) || 1100;

  function reveal(el) {
    el.classList.add('is-visible');
    window.setTimeout(() => el.classList.add('is-settled'), revealMs + 60);
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        obs.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  elements.forEach((el) => {
    // Anything already in view at load time (e.g. above-the-fold cards)
    // reveals immediately, rather than waiting on the observer's first
    // (asynchronous) callback, which would otherwise show a blank flash.
    const rect = el.getBoundingClientRect();
    const alreadyVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (alreadyVisible) {
      reveal(el);
      return;
    }
    observer.observe(el);
  });
}

function initStatCounters() {
  const stats = [...document.querySelectorAll('.case-meta__stat-num')];
  if (!stats.length) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const parseStat = (text) => {
    const match = text.match(/^([\d.]+)(.*)$/);
    if (!match) return null;
    const decimals = (match[1].split('.')[1] || '').length;
    return { value: parseFloat(match[1]), decimals, suffix: match[2] };
  };

  const animate = (el, target) => {
    const duration = 1200;
    const start = performance.now();

    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = (target.value * eased).toFixed(target.decimals) + target.suffix;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseStat(el.textContent.trim());
        if (target) {
          el.textContent = (0).toFixed(target.decimals) + target.suffix;
          animate(el, target);
        }
        obs.unobserve(el);
      });
    },
    { threshold: 0.4 }
  );

  stats.forEach((el) => observer.observe(el));
}

function initHeroCanvas() {
  const canvas = document.getElementById('hero-canvas');
  const hero = document.querySelector('.hero');
  if (!canvas || !hero) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const ctx = canvas.getContext('2d');
  const gridSpacing = 16;
  const minDotRadius = 0.35;
  const maxDotRadius = 3.1;
  const TEXT_FADE_DISTANCE = 200; // px beyond the text box over which dots fade back in

  // Three soft, brand-colored ink clouds. Each one drifts and breathes on
  // its own independent, very slow period, so the field never falls into a
  // visible loop and never reads as a spinner or a particle system.
  const ZONE_DEFS = [
    { color: [150, 147, 154], baseXRatio: 0.22, baseYRatio: 0.4, ampXRatio: 0.16, ampYRatio: 0.16, driftPeriodX: 35, driftPeriodY: 46, phaseX: 0.6, phaseY: 2.1, pulsePeriod: 26, pulsePhase: 0.8, radiusRatio: 0.36, pulseAmpRatio: 0.09, strength: 0.85 },
    { color: [150, 147, 154], baseXRatio: 0.55, baseYRatio: 0.62, ampXRatio: 0.18, ampYRatio: 0.14, driftPeriodX: 41, driftPeriodY: 31, phaseX: 3.4, phaseY: 0.4, pulsePeriod: 33, pulsePhase: 3.1, radiusRatio: 0.4, pulseAmpRatio: 0.1, strength: 0.72 },
    { color: [150, 147, 154], baseXRatio: 0.8, baseYRatio: 0.3, ampXRatio: 0.14, ampYRatio: 0.18, driftPeriodX: 49, driftPeriodY: 38, phaseX: 1.7, phaseY: 4.2, pulsePeriod: 21, pulsePhase: 5.0, radiusRatio: 0.32, pulseAmpRatio: 0.08, strength: 0.65 },
  ];

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cols = 0;
  let rows = 0;
  let offsetX = 0;
  let offsetY = 0;
  let rafId = null;
  let zones = [];

  // The dot field shouldn't render behind the headline text, so we track its
  // bounding box (in hero-local coordinates) and fade dots out near it.
  const textEls = [...hero.querySelectorAll('.eyebrow, .h1, .subhead')];
  let textRect = null;

  function updateTextRect() {
    if (!textEls.length) return;
    const heroRect = hero.getBoundingClientRect();
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    textEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    });
    const pad = 20;
    textRect = {
      left: left - heroRect.left - pad,
      top: top - heroRect.top - pad,
      right: right - heroRect.left + pad,
      bottom: bottom - heroRect.top + pad,
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function seedZones() {
    const minDim = Math.min(width, height);
    zones = ZONE_DEFS.map((z) => ({
      ...z,
      baseRadius: minDim * z.radiusRatio,
      pulseAmp: minDim * z.pulseAmpRatio,
    }));
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.floor(width / gridSpacing) + 1;
    rows = Math.floor(height / gridSpacing) + 1;
    offsetX = (width - (cols - 1) * gridSpacing) / 2;
    offsetY = (height - (rows - 1) * gridSpacing) / 2;

    seedZones();
    updateTextRect();
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);

    const time = now / 1000; // seconds, for readable periods below

    // Advance each zone's center (a slow Lissajous drift) and radius (a
    // slow expand/contract breathe) for this frame.
    const live = zones.map((z) => {
      const cx = width * z.baseXRatio + Math.sin((time / z.driftPeriodX) * Math.PI * 2 + z.phaseX) * width * z.ampXRatio;
      const cy = height * z.baseYRatio + Math.cos((time / z.driftPeriodY) * Math.PI * 2 + z.phaseY) * height * z.ampYRatio;
      const radius = z.baseRadius + Math.sin((time / z.pulsePeriod) * Math.PI * 2 + z.pulsePhase) * z.pulseAmp;
      return { color: z.color, strength: z.strength, cx, cy, radius };
    });

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = offsetX + col * gridSpacing;
        const y = offsetY + row * gridSpacing;

        let textFade = 1;
        if (textRect) {
          const dx = Math.max(textRect.left - x, 0, x - textRect.right);
          const dy = Math.max(textRect.top - y, 0, y - textRect.bottom);
          const dist = Math.sqrt(dx * dx + dy * dy);
          const t = clamp(dist / TEXT_FADE_DISTANCE, 0, 1);
          textFade = t * t * t * (t * (t * 6 - 15) + 10); // smootherstep: a gentler, longer-tailed fade than smoothstep
          if (textFade <= 0) continue;
        }

        // Sum this point's ink density from every zone, tracking a
        // density-weighted color mix so overlapping zones blend hue
        // instead of just stacking opacity.
        let density = 0;
        let r = 0, g = 0, b = 0;
        for (const z of live) {
          const dx = x - z.cx;
          const dy = y - z.cy;
          const distSq = dx * dx + dy * dy;
          const influence = z.strength * Math.exp(-distSq / (2 * z.radius * z.radius));
          density += influence;
          r += z.color[0] * influence;
          g += z.color[1] * influence;
          b += z.color[2] * influence;
        }
        if (density <= 0.004) continue;

        const d = Math.min(density, 1);
        r = Math.round(r / density);
        g = Math.round(g / density);
        b = Math.round(b / density);

        // A slow, continuous per-dot breathing grain (not random flicker)
        // so the texture feels like living ink on paper, not static.
        const grain = 0.92 + 0.08 * Math.sin(time * 0.6 + (col * 12.9898 + row * 78.233) % 6.283);

        // A second, slower and independently-phased scale wave layered on
        // top of the grain, purely for dot size. Both factors are capped at
        // 1, so the combined ceiling never exceeds today's max dot size —
        // it just adds a richer, less uniform breathing motion below that.
        const sizeScale = 0.88 + 0.12 * Math.sin(time * 0.23 + (col * 5.37 + row * 9.11) % 6.283);

        const alpha = d * 0.58 * textFade * grain;
        // Dot area grows roughly with density, the way halftone ink
        // coverage does, rather than radius scaling linearly with tone.
        const radius = (minDotRadius + (maxDotRadius - minDotRadius) * Math.sqrt(d)) * grain * sizeScale;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function tick(now) {
    draw(now);
    rafId = requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener('resize', resize);
  rafId = requestAnimationFrame(tick);
}

function expandDeepDive() {
  const target = document.getElementById('deep-dive');
  if (!target || target.classList.contains('is-expanded')) return;

  target.classList.add('is-expanded');

  const trigger = document.querySelector('.case-jump');
  if (trigger) {
    trigger.setAttribute('aria-expanded', 'true');
    trigger.hidden = true;
  }

  const note = document.querySelector('.case-jump-note');
  if (note) note.hidden = true;

  const backToTop = document.querySelector('.back-to-top');
  if (backToTop) backToTop.hidden = false;
}

function initCaseJumpNav() {
  const nav = document.querySelector('.case-jumpnav');
  if (!nav) return;

  const links = [...nav.querySelectorAll('a')];
  const sections = links
    .map((link) => document.getElementById(link.getAttribute('href').slice(1)))
    .filter(Boolean);
  if (!sections.length) return;

  const deepDive = document.getElementById('deep-dive');

  const setActive = (id) => {
    links.forEach((link) => {
      link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (!visible.length) return;
      visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      setActive(visible[0].target.id);
    },
    { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
  );

  sections.forEach((section) => observer.observe(section));

  // Sections inside the collapsed deep-dive need it expanded before a jump-nav
  // link can actually scroll to them.
  if (deepDive) {
    links.forEach((link) => {
      const section = document.getElementById(link.getAttribute('href').slice(1));
      if (!section || !deepDive.contains(section)) return;
      link.addEventListener('click', (event) => {
        if (deepDive.classList.contains('is-expanded')) return;
        event.preventDefault();
        expandDeepDive();
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
}

function initCaseStudyExpand() {
  const trigger = document.querySelector('.case-jump');
  const target = document.getElementById('deep-dive');
  if (!trigger || !target) return;

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    expandDeepDive();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function setNativeVideoPlaybackRate(container, rate) {
  const videos = container.querySelectorAll('video');
  videos.forEach((video) => {
    video.playbackRate = rate;
    video.addEventListener('loadedmetadata', () => { video.playbackRate = rate; });
    video.addEventListener('play', () => { video.playbackRate = rate; });
  });
}

function setVimeoPlaybackRate(container, videoId, rate) {
  if (typeof Vimeo === 'undefined') return;
  const iframe = container.querySelector(`iframe[src*="${videoId}"]`);
  if (!iframe) return;
  const player = new Vimeo.Player(iframe);
  player.ready().then(() => player.setPlaybackRate(rate)).catch(() => {});
}

function initArchiveModal() {
  const cards = [...document.querySelectorAll('.archive-card')];
  const modal = document.getElementById('archive-modal');
  if (!cards.length || !modal) return;

  const dialog = modal.querySelector('.archive-modal__dialog');
  const yearEl = document.getElementById('archive-modal-year');
  const titleEl = document.getElementById('archive-modal-title');
  const imageEl = document.getElementById('archive-modal-image');
  const bodyEl = document.getElementById('archive-modal-body');
  const tagsEl = document.getElementById('archive-modal-tags');
  const noteEl = modal.querySelector('.archive-modal__note');
  const expandBtn = modal.querySelector('.archive-modal__expand');
  let lastFocused = null;

  function openModal(card) {
    const year = card.querySelector('.archive-card__year');
    const avatarImg = card.querySelector('.archive-card__avatar img');
    const title = card.querySelector('h3');
    const body = card.querySelector('.archive-card__body');
    const tags = card.querySelector('.tag-row');
    const fullId = card.dataset.full;
    const fullTemplate = fullId ? document.getElementById(fullId) : null;

    yearEl.textContent = year ? year.textContent : '';
    titleEl.textContent = title ? title.textContent : '';
    if (avatarImg) {
      imageEl.src = avatarImg.src;
      imageEl.alt = avatarImg.alt;
    }
    tagsEl.innerHTML = tags ? tags.innerHTML : '';
    tagsEl.querySelectorAll('.pill--dark').forEach((pill) => pill.classList.remove('pill--dark'));

    if (fullTemplate) {
      bodyEl.innerHTML = fullTemplate.innerHTML;
      if (noteEl) noteEl.hidden = true;
      setVimeoPlaybackRate(bodyEl, '598947983', 1.25);
      setNativeVideoPlaybackRate(bodyEl, 1.25);
    } else {
      bodyEl.textContent = body ? body.textContent : '';
      if (noteEl) noteEl.hidden = false;
    }

    modal.classList.remove('is-fullscreen');
    if (expandBtn) {
      expandBtn.setAttribute('aria-pressed', 'false');
      expandBtn.setAttribute('aria-label', 'Expand to full screen');
    }

    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('.archive-modal__close').focus();
  }

  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      const expanded = modal.classList.toggle('is-fullscreen');
      expandBtn.setAttribute('aria-pressed', String(expanded));
      expandBtn.setAttribute('aria-label', expanded ? 'Exit full screen' : 'Expand to full screen');
    });
  }

  bodyEl.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-modal-jump]');
    if (!trigger) return;
    event.preventDefault();
    const deepDive = bodyEl.querySelector('[data-modal-deep-dive]');
    if (!deepDive) return;
    deepDive.classList.add('is-expanded');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.hidden = true;
  });

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  cards.forEach((card) => {
    card.addEventListener('click', (event) => {
      event.preventDefault();
      openModal(card);
    });
  });

  modal.querySelectorAll('[data-modal-close]').forEach((el) => {
    el.addEventListener('click', closeModal);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || modal.hidden) return;
    const lightbox = document.querySelector('.lightbox');
    if (lightbox && !lightbox.hidden) return;
    closeModal();
  });

  dialog.addEventListener('click', (event) => event.stopPropagation());
}

function initLightbox() {
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.hidden = true;
  lightbox.innerHTML = `
    <div class="lightbox__overlay" data-lightbox-close></div>
    <button class="lightbox__close" type="button" data-lightbox-close aria-label="Close">&times;</button>
    <div class="lightbox__image-wrap">
      <img class="lightbox__image" src="" alt="" />
    </div>
    <p class="lightbox__caption"></p>
  `;
  document.body.appendChild(lightbox);

  const imageEl = lightbox.querySelector('.lightbox__image');
  const captionEl = lightbox.querySelector('.lightbox__caption');
  const archiveModal = document.getElementById('archive-modal');
  let lastFocused = null;

  function getCaptionFor(img) {
    const next = img.nextElementSibling;
    if (next && next.classList.contains('case-figcaption-standalone')) return next.textContent;
    const figure = img.closest('.case-figure');
    const figcaption = figure ? figure.querySelector('figcaption') : null;
    return figcaption ? figcaption.textContent : '';
  }

  function openLightbox(img) {
    imageEl.src = img.currentSrc || img.src;
    imageEl.alt = img.alt;
    const captionText = getCaptionFor(img);
    captionEl.textContent = captionText;
    captionEl.hidden = !captionText;

    lastFocused = document.activeElement;
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    lightbox.querySelector('.lightbox__close').focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    if (!archiveModal || archiveModal.hidden) {
      document.body.style.overflow = '';
    }
    imageEl.src = '';
    if (lastFocused) lastFocused.focus();
  }

  document.addEventListener('click', (event) => {
    const img = event.target.closest('img.case-image-full, .case-figure img, .case-gallery img');
    if (!img) return;
    openLightbox(img);
  }, true);

  lightbox.querySelectorAll('[data-lightbox-close]').forEach((el) => {
    el.addEventListener('click', closeLightbox);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });
}

function initAutoplayVideos() {
  const videos = document.querySelectorAll('video[autoplay]');
  if (!videos.length) return;

  const tryPlay = (video) => {
    video.muted = true;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  };

  videos.forEach((video) => {
    tryPlay(video);
    video.addEventListener('loadeddata', () => tryPlay(video));
    video.addEventListener('canplay', () => tryPlay(video));
  });

  const retryAll = () => videos.forEach(tryPlay);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) retryAll();
  });
  window.addEventListener('pageshow', retryAll);
  ['touchstart', 'click'].forEach((evt) => {
    window.addEventListener(evt, retryAll, { once: true, passive: true });
  });
}

function initScrollPlayVideos() {
  if (!document.querySelector('.case-hero')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  // The hero video keeps its own always-on autoplay; everything below it plays on scroll.
  const videos = [...document.querySelectorAll('main video')].filter((video) => !video.closest('.case-hero'));
  if (!videos.length) return;

  // Pauses we trigger ourselves, or that the browser triggers while the tab is
  // hidden, must not count as the visitor pausing a video.
  const pausedByScroll = new WeakSet();
  const pausedByUser = new WeakSet();
  const inView = new Set();

  videos.forEach((video) => {
    video.removeAttribute('autoplay');
    video.muted = true;
    video.addEventListener('pause', () => {
      if (pausedByScroll.has(video)) {
        pausedByScroll.delete(video);
      } else if (!video.ended && !document.hidden) {
        pausedByUser.add(video);
      }
    });
    video.addEventListener('play', () => pausedByUser.delete(video));
  });

  const playObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        const mostlyVisible =
          entry.isIntersecting &&
          (entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= window.innerHeight * 0.5);

        if (mostlyVisible) {
          inView.add(video);
          if (pausedByUser.has(video)) return;
          const playPromise = video.play();
          if (playPromise !== undefined) playPromise.catch(() => {});
        } else {
          inView.delete(video);
          if (!video.paused) {
            pausedByScroll.add(video);
            video.pause();
          }
        }
      });
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] }
  );

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    inView.forEach((video) => {
      if (!video.paused || pausedByUser.has(video)) return;
      const playPromise = video.play();
      if (playPromise !== undefined) playPromise.catch(() => {});
    });
  });

  // Start loading a little before a video scrolls into view so it can begin right away.
  const preloadObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.preload = 'auto';
        preloadObserver.unobserve(entry.target);
      });
    },
    { rootMargin: '400px 0px' }
  );

  videos.forEach((video) => {
    playObserver.observe(video);
    preloadObserver.observe(video);
  });
}

function initCapabilitiesAccordion() {
  const items = [...document.querySelectorAll('.capability-item')];
  if (!items.length) return;

  function setOpen(item, isOpen) {
    const trigger = item.querySelector('.capability-item__trigger');
    const panel = item.querySelector('.capability-item__panel');
    item.classList.toggle('is-open', isOpen);
    panel.classList.toggle('is-open', isOpen);
    trigger.setAttribute('aria-expanded', String(isOpen));
  }

  items.forEach((item) => {
    const trigger = item.querySelector('.capability-item__trigger');
    trigger.addEventListener('click', () => {
      const isOpen = trigger.getAttribute('aria-expanded') === 'true';
      if (isOpen) {
        setOpen(item, false);
        return;
      }
      items.forEach((other) => {
        if (other !== item) setOpen(other, false);
      });
      setOpen(item, true);
    });
  });
}

function initExperienceAccordion() {
  const items = [...document.querySelectorAll('.experience-item')];
  if (!items.length) return;

  function setOpen(item, isOpen) {
    const trigger = item.querySelector('.experience-item__trigger');
    const panel = item.querySelector('.experience-item__panel');
    item.classList.toggle('is-open', isOpen);
    panel.classList.toggle('is-open', isOpen);
    trigger.setAttribute('aria-expanded', String(isOpen));
  }

  items.forEach((item) => {
    const trigger = item.querySelector('.experience-item__trigger');
    trigger.addEventListener('click', () => {
      const isOpen = trigger.getAttribute('aria-expanded') === 'true';
      if (isOpen) {
        setOpen(item, false);
        return;
      }
      items.forEach((other) => {
        if (other !== item) setOpen(other, false);
      });
      setOpen(item, true);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setNativeVideoPlaybackRate(document, 1.25);
  initTestimonialCycler();
  initScrollReveal();
  initStatCounters();
  initHeroCanvas();
  initCaseStudyExpand();
  initCaseJumpNav();
  initArchiveModal();
  initLightbox();
  initScrollPlayVideos();
  initAutoplayVideos();
  // initCapabilitiesAccordion(); // section held back from production for now, re-enable when it goes live
  initExperienceAccordion();
});
