function initTestimonialCarousel() {
  const carousel = document.querySelector('.testimonial-carousel');
  if (!carousel) return;

  const slides = [...carousel.querySelectorAll('.testimonial-slide')];
  if (slides.length <= 1) return;

  const intervalMs = 5000;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let index = slides.findIndex((slide) => slide.classList.contains('is-active'));
  if (index === -1) index = 0;
  let timer = null;

  function show(nextIndex) {
    slides[index].classList.remove('is-active');
    index = (nextIndex + slides.length) % slides.length;
    slides[index].classList.add('is-active');
  }

  function next() {
    show(index + 1);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function start() {
    if (prefersReducedMotion) return;
    stop();
    timer = setInterval(next, intervalMs);
  }

  carousel.addEventListener('mouseenter', stop);
  carousel.addEventListener('mouseleave', start);
  carousel.addEventListener('focusin', stop);
  carousel.addEventListener('focusout', start);

  start();
}

function initScrollReveal() {
  const elements = [...document.querySelectorAll('[data-reveal]')];
  if (!elements.length) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    elements.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  elements.forEach((el) => observer.observe(el));
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
  const dotColor = '193, 185, 198';
  const gridSpacing = 28;
  const dotSize = 2;
  const glowRadius = 110;

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cols = 0;
  let rows = 0;
  let offsetX = 0;
  let offsetY = 0;
  let pointer = { x: -9999, y: -9999, active: false };
  let rafId = null;

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

    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = offsetX + col * gridSpacing;
        const y = offsetY + row * gridSpacing;

        let alpha = 0.06;
        let size = dotSize;

        if (pointer.active) {
          const dx = pointer.x - x;
          const dy = pointer.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const proximity = Math.max(0, 1 - dist / glowRadius);
          alpha = 0.06 + proximity * 0.5;
          size = dotSize + proximity * 1.6;
        }

        ctx.fillStyle = `rgba(${dotColor}, ${alpha})`;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
  }

  function handlePointerMove(event) {
    const rect = hero.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.active = true;
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function handlePointerLeave() {
    pointer.active = false;
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function tick() {
    draw();
    rafId = null;
  }

  resize();
  window.addEventListener('resize', resize);
  hero.addEventListener('mousemove', handlePointerMove);
  hero.addEventListener('mouseleave', handlePointerLeave);
}

function initCaseStudyExpand() {
  const trigger = document.querySelector('.case-jump');
  const target = document.getElementById('deep-dive');
  if (!trigger || !target) return;

  trigger.addEventListener('click', (event) => {
    event.preventDefault();

    target.classList.add('is-expanded');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.hidden = true;

    const note = document.querySelector('.case-jump-note');
    if (note) note.hidden = true;

    const backToTop = document.querySelector('.back-to-top');
    if (backToTop) backToTop.hidden = false;

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function initCatWidget() {
  const widget = document.querySelector('.cat-widget');
  const catWrapper = widget ? widget.querySelector('.cat_wrapper') : null;
  if (!widget || !catWrapper) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const cat = widget.querySelector('.cat');
  const head = widget.querySelector('.cat_head');
  const legs = widget.querySelectorAll('.leg');
  const pos = { x: null, y: null };

  const walk = () => {
    cat.classList.remove('first_pose');
    legs.forEach((leg) => leg.classList.add('walk'));
  };

  const handleMouseMotion = (event) => {
    const rect = widget.getBoundingClientRect();
    pos.x = event.clientX - rect.left;
    pos.y = event.clientY - rect.top;
    walk();
  };

  const turnRight = () => {
    cat.style.left = `${pos.x - 90}px`;
    cat.classList.remove('face_left');
    cat.classList.add('face_right');
  };

  const turnLeft = () => {
    cat.style.left = `${pos.x + 10}px`;
    cat.classList.remove('face_right');
    cat.classList.add('face_left');
  };

  const decideTurnDirection = () => {
    const catX = cat.getBoundingClientRect().x - widget.getBoundingClientRect().x;
    catX < pos.x ? turnRight() : turnLeft();
  };

  const headMotion = () => {
    pos.y > widget.clientHeight - 40 ? (head.style.top = '-15px') : (head.style.top = '-30px');
  };

  const decideStop = () => {
    if (
      (cat.classList.contains('face_right') && pos.x - 90 === cat.offsetLeft) ||
      (cat.classList.contains('face_left') && pos.x + 10 === cat.offsetLeft)
    ) {
      legs.forEach((leg) => leg.classList.remove('walk'));
    }
  };

  const intervalId = setInterval(() => {
    if (pos.x === null || pos.y === null) return;
    decideTurnDirection();
    headMotion();
    decideStop();
  }, 100);

  const leaveInterval = () => {
    pos.x = null;
    pos.y = null;
    legs.forEach((leg) => leg.classList.remove('walk'));
    cat.classList.add('first_pose');
  };

  widget.addEventListener('mousemove', handleMouseMotion);
  widget.addEventListener('mouseleave', leaveInterval);
  window.addEventListener('beforeunload', () => clearInterval(intervalId));
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
    } else {
      bodyEl.textContent = body ? body.textContent : '';
      if (noteEl) noteEl.hidden = false;
    }

    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('.archive-modal__close').focus();
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
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  dialog.addEventListener('click', (event) => event.stopPropagation());
}

document.addEventListener('DOMContentLoaded', () => {
  initTestimonialCarousel();
  initScrollReveal();
  initStatCounters();
  initHeroCanvas();
  initCaseStudyExpand();
  initCatWidget();
  initArchiveModal();
});
