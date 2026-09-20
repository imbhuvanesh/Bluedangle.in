(() => {
  "use strict";

  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let w = 0;
  let h = 0;
  let dpr = 1;

  const pivot = { x: 0, y: 0 }; // anchor at top edge
  const bob = { x: 0, y: 0, vx: 0, vy: 0, prevX: 0, prevY: 0 };
  let restLength = 260;
  let radius = 30;
  let stretch = 0;

  const target = { x: 0, y: 0 };
  let dragging = false;
  let revealed = false;

  let time = 0;
  let last = 0;
  let rafId = 0;

  const hintEl = document.getElementById("hint");
  const actionsEl = document.getElementById("actions");
  const downloadBtnEl = document.getElementById("downloadBtn");
  const downloadCountEl = document.getElementById("downloadCount");

  const QUOTES = [
    "Stay good, stay lucky",
    "Protect your light, keep the dark away",
    "Good vibes only in",
    "Stay blessed, stay protected",
    "Mann shant, future bright",
    "Keep evil out, keep goodness in",
  ];
  const quoteEl = document.getElementById("preloaderQuote");

  const DL_KEY = "blue-dangle-downloads";

  const RAZORPAY_LINK = "https://rzp.io/rzp/R95Yg8mW";
  const payBtn = document.getElementById("payBtn");

  function unlockDownload() {
    if (!downloadBtnEl) return;
    actionsEl.dataset.valid = "true";
    downloadBtnEl.textContent = "📥 Download Blue Dangle";
    downloadBtnEl.removeAttribute("aria-disabled");
    downloadBtnEl.removeAttribute("tabindex");
    if (payBtn) payBtn.remove();
    document.body.classList.add("unlocked");
  }

  function checkReturnStatus() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("razorpay_payment_link_status");
    return status === "paid";
  }

  function bindPay() {
    if (!payBtn) return;
    payBtn.addEventListener("click", () => {
      window.location.href = RAZORPAY_LINK;
    });
  }

  function renderDownloadCount() {
    if (!downloadCountEl) return;
    const n = parseInt(localStorage.getItem(DL_KEY) || "0", 10);
    downloadCountEl.textContent = "Downloads: " + n;
  }

  function bindDownload() {
    if (!downloadBtnEl) return;
    downloadBtnEl.addEventListener("click", (e) => {
      if (actionsEl.dataset.valid !== "true") {
        e.preventDefault();
        return;
      }
      const n = parseInt(localStorage.getItem(DL_KEY) || "0", 10) + 1;
      localStorage.setItem(DL_KEY, String(n));
      renderDownloadCount();
    });
  }

  const charm = new Image();
  let charmLoaded = false;
  let charmFailed = false;
  let charmRatio = 0.7;
  charm.onload = () => {
    charmLoaded = true;
    charmRatio = charm.naturalWidth / charm.naturalHeight;
    tryReveal();
  };
  charm.onerror = () => {
    charmFailed = true;
    tryReveal();
  };
  charm.src = "one.png";

  const MAX_STRETCH_FACTOR = 0.12;
  const GRAVITY = 2600;
  const ROPE_STIFFNESS = 220;
  const AIR = 0.5;
  const SWAY = 18;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    pivot.x = w / 2;
    pivot.y = 0;

    restLength = clamp(Math.min(w * 0.42, h * 0.42), 130, 420);
    radius = clamp(Math.min(w, h) * 0.05, 15, 38);

    syncBobToRest();
    positionHint();
    positionActions();
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function syncBobToRest() {
    bob.x = pivot.x;
    bob.y = pivot.y + restLength + stretch;
    bob.vx = 0;
    bob.vy = 0;
    bob.prevX = bob.x;
    bob.prevY = bob.y;
  }

  function positionHint() {
    const size = charmSize();
    const y = pivot.y + restLength - 20;
    const top = Math.min(y, h - 300);
    hintEl.style.top = Math.max(top, 90) + "px";
    hintEl.style.transform = "translateX(-50%)";
  }

  function positionActions() {
    if (!actionsEl) return;
    const size = charmSize();
    const baseY = pivot.y + restLength + size.h + 40;
    const top = Math.min(baseY, h - 180);
    actionsEl.style.top = Math.max(top, 240) + "px";
    actionsEl.style.left = "50%";
    actionsEl.style.transform = "translateX(-50%)";
  }

  function charmSize() {
    const maxH = radius * 3.4;
    const maxW = Math.min(restLength * 0.8, w * 0.4);
    let cw = maxH * charmRatio;
    let ch = maxH;
    if (cw > maxW) {
      ch = (maxW / cw) * maxH;
      cw = maxW;
    }
    return { w: cw, h: ch };
  }

  function pointers() {
    let pointerId = null;

    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;

      const dxb = e.clientX - bob.x;
      const dyb = e.clientY - bob.y;
      const csize = charmSize();
      const grabR = Math.max(radius * 2.6, csize.w * 0.9, csize.h * 0.7) + 18;
      if (Math.hypot(dxb, dyb) > grabR) return;

      pointerId = e.pointerId;
      canvas.setPointerCapture(pointerId);
      document.body.classList.add("interacted");
      dragging = true;
      target.x = e.clientX;
      target.y = e.clientY;
      document.body.classList.add("dragging");
    });

    canvas.addEventListener("pointermove", (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
    });

    const release = () => {
      if (pointerId === null) return;
      pointerId = null;
      dragging = false;
      document.body.classList.remove("dragging");
    };

    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
  }

  function physics(dt) {
    const subSteps = 3;
    const h = dt / subSteps;

    for (let i = 0; i < subSteps; i++) {
      let ax = 0;
      let ay = GRAVITY;

      if (dragging) {
        limiter();
        ax = (target.x - bob.x) * ROPE_STIFFNESS;
        ay += (target.y - bob.y) * ROPE_STIFFNESS;
      } else {
        const sway = Math.sin(time * 0.9) * SWAY + Math.sin(time * 1.7 + 2) * SWAY * 0.4;
        ax += sway * wobbleEnvelope();
      }

      bob.vx += ax * h;
      bob.vy += ay * h;

      const damp = Math.exp(-AIR * h);
      bob.vx *= damp;
      bob.vy *= damp;

      bob.prevX = bob.x;
      bob.prevY = bob.y;
      bob.x += bob.vx * h;
      bob.y += bob.vy * h;

      ropeConstraint();
    }

    time += dt;
  }

  function limiter() {
    const dx = target.x - pivot.x;
    const dy = target.y - pivot.y;
    const dist = Math.hypot(dx, dy);
    const maxDist = restLength * (1 + MAX_STRETCH_FACTOR);
    if (dist > maxDist) {
      target.x = pivot.x + (dx / dist) * maxDist;
      target.y = pivot.y + (dy / dist) * maxDist;
    }
  }

  function wobbleEnvelope() {
    const speed = Math.hypot(bob.vx, bob.vy);
    return clamp(1.5 - speed * 0.05, 0, 1);
  }

  function ropeConstraint() {
    const dx = bob.x - pivot.x;
    const dy = bob.y - pivot.y;
    const dist = Math.hypot(dx, dy);

    const stretchTarget = dragging ? restLength * MAX_STRETCH_FACTOR : 0;
    stretch += (stretchTarget - stretch) * 0.12;
    const limit = restLength + stretch;

    if (dist > limit && dist > 1e-4) {
      const nx = dx / dist;
      const ny = dy / dist;
      bob.x = pivot.x + nx * limit;
      bob.y = pivot.y + ny * limit;
      const radial = bob.vx * nx + bob.vy * ny;
      if (radial > 0) {
        bob.vx -= nx * radial;
        bob.vy -= ny * radial;
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, w, h);

    ambientGlow();

    const size = charmSize();
    const dx = bob.x - pivot.x;
    const dy = bob.y - pivot.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / dist, y: dy / dist };

    const attachX = bob.x - dir.x * size.h * 0.5;
    const attachY = bob.y - dir.y * size.h * 0.5;

    drawString(attachX, attachY, dir, dist);
    drawDangle(attachX, attachY, dir);
  }

  function ambientGlow() {
    const size = charmSize();
    const cx = bob.x;
    const cy = bob.y - size.h * 0.3;
    const glowR = Math.max(size.w, size.h) * 1.4;
    const g = ctx.createRadialGradient(cx, cy, glowR * 0.15, cx, cy, glowR);
    g.addColorStop(0, "rgba(58, 123, 255, 0.14)");
    g.addColorStop(1, "rgba(58, 123, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawString(x, y, dir, dist) {
    const sag = Math.max(0, 1 - dist / restLength) * restLength * 0.14;

    ctx.save();
    ctx.shadowColor = "rgba(127, 177, 255, 0.25)";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = "rgba(210, 226, 255, 0.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.quadraticCurveTo(
      (pivot.x + x) / 2 - dir.x * sag * 0.6,
      (pivot.y + y) / 2 + sag,
      x,
      y
    );
    ctx.stroke();
    ctx.restore();
  }

  function drawDangle(x, y, dir) {
    const idleSwing = reduceMotion ? 0 : Math.sin(time * 0.6) * 0.04;
    const tilt = clamp(-bob.vx * 0.0016 + idleSwing, -0.42, 0.42);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);

    if (charmLoaded) {
      const size = charmSize();
      const rim = Math.max(size.w, size.h);

      // round halo behind the charm
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(0, size.h * 0.5, rim * 0.2, 0, size.h * 0.5, rim * 0.9);
      halo.addColorStop(0, "rgba(88, 133, 255, 0.32)");
      halo.addColorStop(0.55, "rgba(58, 110, 255, 0.10)");
      halo.addColorStop(1, "rgba(58, 110, 255, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, size.h * 0.5, rim * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // the charm itself, softly lit
      ctx.save();
      ctx.shadowColor = "rgba(58, 123, 255, 0.55)";
      ctx.shadowBlur = rim * 0.8;
      ctx.drawImage(charm, -size.w / 2, 0, size.w, size.h);
      ctx.restore();

      // round edge glow hugging the charm
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const ring = ctx.createRadialGradient(0, size.h * 0.5, rim * 0.42, 0, size.h * 0.5, rim * 0.62);
      ring.addColorStop(0, "rgba(127, 177, 255, 0)");
      ring.addColorStop(1, "rgba(90, 140, 255, 0.22)");
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(0, size.h * 0.5, rim * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.restore();
      return;
    }

    // metallic ring
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.24, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(205, 222, 255, 0.85)";
    ctx.lineWidth = radius * 0.09;
    ctx.stroke();

    // teardrop body
    const grad = ctx.createLinearGradient(-radius * 0.6, radius * 0.3, radius * 0.9, radius * 4.6);
    grad.addColorStop(0, "#8fb9ff");
    grad.addColorStop(0.4, "#3d7bff");
    grad.addColorStop(1, "#1530b8");

    ctx.beginPath();
    ctx.moveTo(0, radius * 0.4);
    ctx.bezierCurveTo(radius, radius * 0.6, radius * 1.15, radius * 2.1, radius * 0.9, radius * 3.05);
    ctx.bezierCurveTo(radius * 0.62, radius * 3.85, radius * 0.3, radius * 4.3, 0, radius * 4.35);
    ctx.bezierCurveTo(-radius * 0.3, radius * 4.3, -radius * 0.62, radius * 3.85, -radius * 0.9, radius * 3.05);
    ctx.bezierCurveTo(-radius * 1.15, radius * 2.1, -radius, radius * 0.6, 0, radius * 0.4);

    ctx.save();
    ctx.shadowColor = "rgba(58, 123, 255, 0.65)";
    ctx.shadowBlur = radius * 1.1;
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // rim light
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // glossy highlight
    ctx.save();
    ctx.translate(-radius * 0.34, radius * 1.1);
    ctx.rotate(-0.6);
    const hl = ctx.createLinearGradient(0, -radius * 0.7, 0, radius * 0.9);
    hl.addColorStop(0, "rgba(255, 255, 255, 0.5)");
    hl.addColorStop(1, "rgba(255, 255, 255, 0.02)");
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.3, radius * 0.85, 0, 0, Math.PI * 2);
    ctx.fillStyle = hl;
    ctx.fill();
    ctx.restore();

    // pocket of light
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const pocket = ctx.createRadialGradient(0, radius * 3.1, radius * 0.1, 0, radius * 3.1, radius * 0.9);
    pocket.addColorStop(0, "rgba(150, 190, 255, 0.4)");
    pocket.addColorStop(1, "rgba(150, 190, 255, 0)");
    ctx.beginPath();
    ctx.ellipse(0, radius * 3.1, radius * 0.9, radius * 1.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = pocket;
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function loop(t) {
    rafId = requestAnimationFrame(loop);
    if (document.hidden) return;

    const dt = Math.min(Math.max((t - last) / 1000, 0), 0.033);
    last = t;

    physics(dt);
    render();
  }

  function assetsReady() {
    return charmLoaded || charmFailed;
  }

  function tryReveal() {
    if (assetsReady() && document.readyState === "complete") {
      reveal();
    }
  }

  function startQuotes() {
    if (!quoteEl) return;
    let i = 0;
    quoteEl.textContent = QUOTES[0];
    requestAnimationFrame(() => requestAnimationFrame(() => quoteEl.classList.add("show")));
    if (reduceMotion) return;

    const cycle = () => {
      i = (i + 1) % QUOTES.length;
      quoteEl.classList.remove("show");
      setTimeout(() => {
        quoteEl.textContent = QUOTES[i];
        quoteEl.classList.add("show");
      }, 700);
    };
    setInterval(cycle, 2200);
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    document.body.classList.add("ready");
    const pre = document.getElementById("preloader");
    pre.classList.add("done");
    setTimeout(() => pre && pre.remove(), 900);
    last = performance.now();
  }

  function start() {
    resize();
    pointers();
    startQuotes();
    bindPay();
    bindDownload();
    renderDownloadCount();
    if (checkReturnStatus()) {
      unlockDownload();
      history.replaceState(null, "", window.location.pathname);
    }
    last = performance.now();
    rafId = requestAnimationFrame(loop);

    const minDelay = reduceMotion ? 250 : 1500;
    const launch = () => {
      setTimeout(() => tryReveal(), 250);
    };

    if (document.readyState === "complete") {
      setTimeout(launch, minDelay);
    } else {
      window.addEventListener("load", () => setTimeout(launch, minDelay), { once: true });
    }

    window.addEventListener("resize", resize);
  }

  start();
})();