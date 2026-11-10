/**
 * Lightweight, zero-dependency canvas confetti engine.
 * Safe for SSR (no-ops when window is undefined).
 */
export function triggerWonConfetti() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const canvas = document.createElement("canvas");
  canvas.id = "won-confetti-canvas";
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "999999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  // Vibrant festive colors
  const colors = [
    "#10b981", // Emerald
    "#34d399", // Light emerald
    "#059669", // Dark emerald
    "#f59e0b", // Amber
    "#fbbf24", // Gold
    "#06b6d4", // Cyan
    "#3b82f6", // Blue
    "#ec4899", // Pink
    "#8b5cf6", // Purple
  ];

  type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    rotation: number;
    vRot: number;
    shape: "rect" | "circle" | "ribbon";
    opacity: number;
  };

  const count = 140;
  const particles: Particle[] = [];

  // Launch from left and right bottom corners toward upper center
  for (let i = 0; i < count; i++) {
    const isLeft = i % 2 === 0;
    const startX = isLeft ? width * 0.15 : width * 0.85;
    const baseAngle = isLeft ? (Math.PI / 4) : (3 * Math.PI / 4);
    const angle = baseAngle + (Math.random() * 0.5 - 0.25);
    const speed = 14 + Math.random() * 14;

    particles.push({
      x: startX,
      y: height * 0.9,
      vx: Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
      size: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.25,
      shape: i % 4 === 0 ? "circle" : i % 3 === 0 ? "ribbon" : "rect",
      opacity: 1,
    });
  }

  const gravity = 0.42;
  const drag = 0.985;
  const startTime = Date.now();
  const duration = 3000; // 3 seconds

  let animId = 0;

  function frame() {
    const elapsed = Date.now() - startTime;
    if (elapsed > duration) {
      cancelAnimationFrame(animId);
      canvas.remove();
      return;
    }

    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += gravity;
      p.vx *= drag;
      p.vy *= drag;
      p.rotation += p.vRot;

      if (elapsed > duration - 900) {
        p.opacity = Math.max(0, (duration - elapsed) / 900);
      }

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;

      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "ribbon") {
        ctx.fillRect(-p.size / 2, -p.size * 1.6, p.size * 0.55, p.size * 2.2);
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }

      ctx.restore();
    }

    animId = requestAnimationFrame(frame);
  }

  animId = requestAnimationFrame(frame);
}

