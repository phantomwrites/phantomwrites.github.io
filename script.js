const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Code layer under the hero (what the X-ray lens reveals) ---------- */
const CODE = `--!strict
-- ServerScriptService/Server/Services/ShopService
local Players = game:GetService("Players")
local Catalog = require(script.Parent.Catalog)      -- prices live on the server
local limiter = RateLimiter.new(4, 1)               -- 4 requests, refill 1/s

local function onPurchase(player: Player, itemId: unknown): string
	if typeof(itemId) ~= "string" then return "Invalid" end
	if not limiter:allow(player) then return "Slow" end
	local item = Catalog[itemId]
	if not item then return "Invalid" end
	local data = PlayerData.get(player)
	if not data or data.Owned[itemId] then return "Owned" end
	if not Currency.spend(player, item.price) then return "Poor" end
	data.Owned[itemId] = true                        -- claim, then grant
	return "Ok"
end

-- hits are claims; the server checks them against its own geometry
local function onHit(player: Player, target: unknown, origin: Vector3)
	if not Cooldowns.ready(player, "Swing") then return end
	local victim = resolveCharacter(target)
	if not victim or not inRange(player, victim, 8) then return end
	Damage.apply(victim, Weapons.get(player).damage)
end

game:BindToClose(function()
	PlayerData.flushAll()                            -- saves survive shutdowns
end)`;

function highlight(src) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return src.split("\n").map((line) => {
    const c = line.indexOf("--");
    const code = c >= 0 ? line.slice(0, c) : line;
    const comment = c >= 0 ? line.slice(c) : "";
    let h = esc(code)
      .replace(/("[^"]*")/g, '<span class="st">$1</span>')
      .replace(/\b(local|function|return|if|then|not|or|end|and)\b/g, '<span class="kw">$1</span>')
      .replace(/\b([A-Za-z_]+)(?=\()/g, '<span class="fn">$1</span>');
    return h + (comment ? `<span class="cm">${esc(comment)}</span>` : "");
  }).join("\n");
}
const codeLayer = document.getElementById("code-layer");
// repeat so the columns fill any screen size
if (codeLayer) codeLayer.innerHTML = highlight([CODE, CODE, CODE, CODE].join("\n\n"));

/* ---------- X-ray lens ---------- */
const hero = document.querySelector(".hero");
const root = document.documentElement;
if (hero) {
  const fine = window.matchMedia("(pointer: fine)").matches;
  let tx = hero.clientWidth * 0.55, ty = hero.clientHeight * 0.45;
  let x = tx, y = ty, r = 0, tr = fine ? 130 : 95;
  let inside = !fine;
  let t0 = performance.now();

  if (fine) {
    hero.addEventListener("pointermove", (e) => {
      const b = hero.getBoundingClientRect();
      tx = e.clientX - b.left; ty = e.clientY - b.top; inside = true;
    });
    hero.addEventListener("pointerleave", () => { inside = false; });
  }

  function frame(now) {
    if (!fine || !inside) {
      // wander slowly across the headline when there's no cursor
      const t = (now - t0) / 1000;
      tx = hero.clientWidth * (0.5 + 0.3 * Math.sin(t * 0.45));
      ty = hero.clientHeight * (0.45 + 0.12 * Math.sin(t * 0.8 + 1));
    }
    const k = reduceMotion ? 1 : 0.12;
    x += (tx - x) * k; y += (ty - y) * k;
    r += (tr - r) * (reduceMotion ? 1 : 0.06);
    root.style.setProperty("--lens-x", x.toFixed(1) + "px");
    root.style.setProperty("--lens-y", y.toFixed(1) + "px");
    root.style.setProperty("--lens-r", r.toFixed(1) + "px");

    // hero recedes as you scroll away
    const s = Math.min(window.scrollY / hero.clientHeight, 1);
    const front = hero.querySelector(".hero-inner");
    if (front && !reduceMotion) {
      front.style.transform = `translateY(${s * -60}px) scale(${1 - s * 0.06})`;
      front.style.filter = `blur(${s * 10}px)`;
      front.style.opacity = String(1 - s * 0.9);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------- Reveal on scroll ---------- */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }
}, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${(i % 4) * 70}ms`;
  io.observe(el);
});

/* ---------- Work: opens on demand; videos only load and play while it's open ---------- */
const workToggle = document.querySelector(".work-toggle");
const workList = document.getElementById("work-list");
if (workToggle && workList) {
  const label = workToggle.querySelector(".wt-label");
  const videos = workList.querySelectorAll("video");
  const setOpen = (open) => {
    workList.classList.toggle("open", open);
    workToggle.setAttribute("aria-expanded", String(open));
    if (label) label.textContent = open ? "Hide work" : "View work";
    if (!open) videos.forEach((v) => v.pause());
  };
  workToggle.addEventListener("click", () => setOpen(!workList.classList.contains("open")));
  // the nav link and the hero's scroll cue open it too
  document.querySelectorAll('a[href="#work"]').forEach((a) => a.addEventListener("click", () => setOpen(true)));
  if (location.hash === "#work") setOpen(true);
}

/* ---------- Work videos: play on click, one at a time ---------- */
document.querySelectorAll(".work-media").forEach((media) => {
  const video = media.querySelector("video");
  const button = media.querySelector(".play-btn");
  if (!video || !button) return;
  button.addEventListener("click", () => {
    document.querySelectorAll(".work-media video").forEach((other) => { if (other !== video) other.pause(); });
    video.muted = false; // a click is consent for sound
    video.controls = true;
    video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
  });
  video.addEventListener("play", () => media.classList.add("playing"));
  video.addEventListener("pause", () => { if (!video.seeking) media.classList.remove("playing"); });
});

/* ---------- Process line fills as you scroll ---------- */
const fill = document.getElementById("process-fill");
const proc = document.querySelector(".process");
if (fill && proc) {
  const onScroll = () => {
    const b = proc.getBoundingClientRect();
    const p = Math.min(Math.max((window.innerHeight * 0.75 - b.top) / (b.height + window.innerHeight * 0.3), 0), 1);
    fill.style.width = (reduceMotion ? 100 : p * 100) + "%";
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ---------- Copy Discord ---------- */
document.querySelectorAll(".copy").forEach((el) => {
  el.addEventListener("click", async () => {
    const hint = el.querySelector(".c-h");
    try { await navigator.clipboard.writeText(el.dataset.copy); if (hint) hint.textContent = "copied ✓"; }
    catch { if (hint) hint.textContent = el.dataset.copy; }
    setTimeout(() => { if (hint) hint.textContent = "copy"; }, 2000);
  });
});

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());
