(function () {
  const canvas = document.getElementById("archCanvas");
  const overlay = document.getElementById("flowOverlay");
  const buttons = document.getElementById("scenarioBtns");
  const playAll = document.getElementById("playAll");
  if (!canvas || !buttons || !playAll || !overlay) return;

  const COLORS = {
    client: "#1A6B61",
    replica: "#2b6cb0",
    crr: "#6929c4",
    vault: "#c2410c",
    grafana: "#f46800",
    registry: "#198038",
  };

  const scenes = [
    { id: "healthy", label: "Healthy CRR" },
    { id: "pod", label: "Pod failover" },
    { id: "zone", label: "Zone loss" },
    { id: "quorum", label: "No quorum" },
    { id: "planned", label: "Planned region switch" },
    { id: "unplanned", label: "Unplanned region DR" },
    { id: "restore", label: "Restore original site" },
  ];

  const roles = {
    healthy: {
      live: "LIVE", rec: "RECOVERY",
      l0: ["Active", "active"], l1: ["Replica", "replica"], l2: ["Replica", "replica"],
      r0: ["Leader", "leader"], r1: ["Follower", "replica"], r2: ["Follower", "replica"],
    },
    pod: {
      live: "LIVE", rec: "RECOVERY",
      l0: ["Down", "down"], l1: ["Active", "active"], l2: ["Replica", "replica"],
      r0: ["Leader", "leader"], r1: ["Follower", "replica"], r2: ["Follower", "replica"],
    },
    zone: {
      live: "LIVE 2/3", rec: "RECOVERY",
      l0: ["AZ down", "down"], l1: ["Active", "active"], l2: ["Replica", "replica"],
      r0: ["Leader", "leader"], r1: ["Follower", "replica"], r2: ["Follower", "replica"],
    },
    quorum: {
      live: "NO QUORUM", rec: "RECOVERY",
      l0: ["Down", "down"], l1: ["Down", "down"], l2: ["No quorum", "down"],
      r0: ["Leader", "leader"], r1: ["Follower", "replica"], r2: ["Follower", "replica"],
    },
    planned: {
      live: "RECOVERY", rec: "LIVE",
      l0: ["Leader", "leader"], l1: ["Follower", "replica"], l2: ["Follower", "replica"],
      r0: ["Active", "active"], r1: ["Replica", "replica"], r2: ["Replica", "replica"],
    },
    unplanned: {
      live: "DOWN", rec: "LIVE",
      l0: ["Region down", "down"], l1: ["Region down", "down"], l2: ["Region down", "down"],
      r0: ["Active", "active"], r1: ["Replica", "replica"], r2: ["Replica", "replica"],
    },
    restore: {
      live: "RECOVERY", rec: "LIVE",
      l0: ["Catch-up", "replica"], l1: ["Follower", "replica"], l2: ["Follower", "replica"],
      r0: ["Active", "active"], r1: ["Replica", "replica"], r2: ["Replica", "replica"],
    },
  };

  const nhaStats = {
    healthy: {
      live: ["QUORUM 3/3 · INSYNC · BACKLOG 0 · GRPROLE Live", "live"],
      rec: ["QUORUM 3/3 · INSYNC · BACKLOG 0 · GRPROLE Recovery · RCOVLSN in-sync", "recovery"],
    },
    pod: {
      live: ["QUORUM 2/3 · INSYNC · BACKLOG · pod-0 DOWN", "live"],
      rec: ["QUORUM 3/3 · INSYNC · BACKLOG 0 · GRPROLE Recovery", "recovery"],
    },
    zone: {
      live: ["QUORUM 2/3 · AZ-1 down · remaining instances INSYNC", "live"],
      rec: ["QUORUM 3/3 · INSYNC · BACKLOG 0 · GRPROLE Recovery", "recovery"],
    },
    quorum: {
      live: ["QUORUM 1/3 · no majority · log writes blocked", "down"],
      rec: ["QUORUM 3/3 · INSYNC · GRPROLE Recovery", "recovery"],
    },
    planned: {
      live: ["QUORUM 3/3 · GRPROLE Recovery · Pending switch · RPO 0", "recovery"],
      rec: ["QUORUM 3/3 · INSYNC · GRPROLE Live", "live"],
    },
    unplanned: {
      live: ["DOWN · remotes.enabled=false", "down"],
      rec: ["QUORUM 3/3 · GRPROLE Live · check RCOVLSN / RCOVTIME", "live"],
    },
    restore: {
      live: ["QUORUM 3/3 · catch-up · BACKLOG > 0 · GRPROLE Recovery", "recovery"],
      rec: ["QUORUM 3/3 · INSYNC · GRPROLE Live", "live"],
    },
  };

  function roleKind(label) {
    const t = String(label || "").toUpperCase();
    if (t.includes("DOWN") || t.includes("NO QUORUM")) return "down";
    if (t.includes("RECOVERY")) return "recovery";
    return "live";
  }

  let current = 0;
  let timer = null;

  function setPod(id, text, kind) {
    const pod = canvas.querySelector('[data-node="' + id + '"]');
    const role = canvas.querySelector('[data-role="' + id + '"]');
    if (!pod) return;
    pod.classList.remove("active", "replica", "leader", "down");
    pod.classList.add(kind);
    if (role) role.textContent = text;
  }

  function box(name) {
    const el = canvas.querySelector('[data-anchor="' + name + '"]');
    if (!el || !overlay) return null;
    const a = el.getBoundingClientRect();
    const c = overlay.getBoundingClientRect();
    return {
      l: a.left - c.left,
      r: a.right - c.left,
      t: a.top - c.top,
      b: a.bottom - c.top,
      x: a.left + a.width / 2 - c.left,
      y: a.top + a.height / 2 - c.top,
    };
  }

  function pt(name, edge) {
    const b = box(name);
    if (!b) return null;
    if (edge === "right") return { x: b.r, y: b.y };
    if (edge === "left") return { x: b.l, y: b.y };
    if (edge === "bottom") return { x: b.x, y: b.b };
    if (edge === "top") return { x: b.x, y: b.t };
    return { x: b.x, y: b.y };
  }

  function ortho(a, b, viaY) {
    const x1 = a.x.toFixed(1);
    const y1 = a.y.toFixed(1);
    const x2 = b.x.toFixed(1);
    const y2 = b.y.toFixed(1);
    const vy = viaY.toFixed(1);
    if (Math.abs(a.x - b.x) < 8) {
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    return `M ${x1} ${y1} L ${x1} ${vy} L ${x2} ${vy} L ${x2} ${y2}`;
  }

  function straight(a, b) {
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }

  function orthoX(a, b, viaX) {
    const x1 = a.x.toFixed(1);
    const y1 = a.y.toFixed(1);
    const x2 = b.x.toFixed(1);
    const y2 = b.y.toFixed(1);
    const vx = viaX.toFixed(1);
    if (Math.abs(a.y - b.y) < 8) {
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    return `M ${x1} ${y1} L ${vx} ${y1} L ${vx} ${y2} L ${x2} ${y2}`;
  }

  function draw() {
    if (!overlay) return;
    const w = Math.max(canvas.clientWidth, canvas.scrollWidth);
    const h = Math.max(canvas.clientHeight, canvas.scrollHeight);
    overlay.setAttribute("viewBox", `0 0 ${w} ${h}`);
    overlay.setAttribute("width", w);
    overlay.setAttribute("height", h);

    const northEl = canvas.querySelector(".north-bar");
    const liveClEl = canvas.querySelector(".cluster.live");
    const recClEl = canvas.querySelector(".cluster.rec");
    const vaultBoxEl = canvas.querySelector(".vault-box");
    if (!northEl || !liveClEl || !vaultBoxEl) return;
    const north = northEl.getBoundingClientRect();
    const liveCl = liveClEl.getBoundingClientRect();
    const recCl = recClEl ? recClEl.getBoundingClientRect() : liveCl;
    const vaultEl = vaultBoxEl.getBoundingClientRect();
    const c = overlay.getBoundingClientRect();
    const stacked = recCl.top > liveCl.bottom - 12;
    const topHwy = north.bottom - c.top + (liveCl.top - north.bottom) * 0.5;
    const botFrom = stacked ? recCl : liveCl;
    const botHwy = botFrom.bottom - c.top + Math.max(8, vaultEl.top - botFrom.bottom) * 0.5;
    const leftX = 10;
    const rightX = w - 10;

    const scene = scenes[current].id;
    const toRec = scene === "planned" || scene === "unplanned" || scene === "restore";
    const side = toRec ? "rec" : "live";
    const activePod = toRec ? "r0" : scene === "pod" || scene === "zone" ? "l1" : "l0";

    const hops = [];
    function push(kind, d) {
      if (d) hops.push({ kind, d });
    }

    const clEl = canvas.querySelector(side === "rec" ? ".cluster.rec" : ".cluster.live");
    const routerRowEl = clEl && clEl.querySelector(".router-row");
    const flowRowEl = clEl && clEl.querySelector(".flow-row");
    const azRowEl = clEl && clEl.querySelector(".az-row");
    if (!routerRowEl || !flowRowEl || !azRowEl) return;
    const routerRow = routerRowEl.getBoundingClientRect();
    const flowRow = flowRowEl.getBoundingClientRect();
    const azRow = azRowEl.getBoundingClientRect();
    const hwyRouter = routerRow.bottom - c.top + (flowRow.top - routerRow.bottom) * 0.5;
    const hwyPod = flowRow.bottom - c.top + (azRow.top - flowRow.bottom) * 0.5;

    const lb = pt("lb", "bottom");
    const ocpRouter = pt(side + "-router", "top");
    if (lb && ocpRouter) {
      if (stacked && toRec) push("client", orthoX(lb, ocpRouter, rightX));
      else push("client", ortho(lb, ocpRouter, topHwy));
    }

    const rtrB = pt(side + "-router", "bottom");
    const routeT = pt(side + "-route", "top");
    if (rtrB && routeT) push("client", ortho(rtrB, routeT, hwyRouter));

    const routeR = pt(side + "-route", "right");
    const svcL = pt(side + "-svc", "left");
    if (routeR && svcL) push("client", straight(routeR, svcL));

    if (scene !== "quorum") {
      const svcB = pt(side + "-svc", "bottom");
      const pod = pt(activePod, "top");
      if (svcB && pod) push("client", ortho(svcB, pod, hwyPod));
    }

    const pairs = [
      ["l0", "l1"],
      ["l1", "l2"],
      ["r0", "r1"],
      ["r1", "r2"],
    ];
    pairs.forEach(([idA, idB]) => {
      const ba = box(idA);
      const bb = box(idB);
      if (!ba || !bb) return;
      if (bb.t > ba.b - 4) {
        const pa = pt(idA, "bottom");
        const pb = pt(idB, "top");
        if (pa && pb) push("replica", ortho(pa, pb, ba.b + (bb.t - ba.b) * 0.5));
      } else {
        const pa = pt(idA, "right");
        const pb = pt(idB, "left");
        if (pa && pb) push("replica", straight(pa, pb));
      }
    });

    if (scene !== "unplanned") {
      if (stacked) {
        const crrA = pt("live-crr", "bottom");
        const crrB = pt("rec-crr", "top");
        if (crrA && crrB) push("crr", ortho(crrA, crrB, crrA.y + (crrB.y - crrA.y) * 0.5));
      } else {
        const crrA = pt("live-crr", "right");
        const crrB = pt("rec-crr", "left");
        if (crrA && crrB) push("crr", straight(crrA, crrB));
      }
    }

    const vault = pt("vault-box", "top");
    const ls = pt("live-secret", "bottom");
    const rs = pt("rec-secret", "bottom");
    if (vault && ls) push("vault", stacked ? orthoX(vault, ls, leftX) : ortho(vault, ls, botHwy));
    if (vault && rs) push("vault", stacked ? orthoX(vault, rs, leftX) : ortho(vault, rs, botHwy));

    const graf = pt("grafana-box", "top");
    const lm = pt("live-metrics", "bottom");
    const rm = pt("rec-metrics", "bottom");
    if (graf && lm) push("grafana", stacked ? orthoX(graf, lm, leftX + 16) : ortho(graf, lm, botHwy));
    if (graf && rm) push("grafana", stacked ? orthoX(graf, rm, leftX + 16) : ortho(graf, rm, botHwy));

    const reg = pt("registry-box", "top");
    const lo = pt("live-op", "bottom");
    const rop = pt("rec-op", "bottom");
    if (reg && rop) push("registry", stacked ? orthoX(reg, rop, rightX) : ortho(reg, rop, botHwy));
    if (reg && lo) push("registry", stacked ? orthoX(reg, lo, rightX) : ortho(reg, lo, botHwy));

    const defs = Object.entries(COLORS)
      .map(
        ([k, col]) =>
          `<marker id="m-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${col}"/></marker>`
      )
      .join("");

    overlay.innerHTML =
      `<defs>${defs}</defs>` +
      hops
        .map(
          (h) =>
            `<path class="flow-path ${h.kind}${h.kind === "replica" ? "" : " pulse"}" marker-end="url(#m-${h.kind})" d="${h.d}"/>`
        )
        .join("");
  }

  function apply(i) {
    current = i;
    const s = scenes[i];
    canvas.className = "arch-canvas scene-" + s.id;
    const r = roles[s.id];
    const roleLiveEl = document.getElementById("roleLive");
    const roleRecEl = document.getElementById("roleRec");
    roleLiveEl.textContent = r.live;
    roleRecEl.textContent = r.rec;
    roleLiveEl.className = "cluster-meta is-" + roleKind(r.live);
    roleRecEl.className = "cluster-meta is-" + roleKind(r.rec);
    const st = nhaStats[s.id];
    const liveM = document.getElementById("metricsLive");
    const recM = document.getElementById("metricsRec");
    if (liveM) {
      liveM.textContent = st.live[0];
      liveM.className = "nha-metrics " + st.live[1];
    }
    if (recM) {
      recM.textContent = st.rec[0];
      recM.className = "nha-metrics " + st.rec[1];
    }
    ["l0", "l1", "l2", "r0", "r1", "r2"].forEach((id) => setPod(id, r[id][0], r[id][1]));
    [...buttons.querySelectorAll("button")].forEach((b, n) =>
      b.classList.toggle("active", n === i)
    );
    requestAnimationFrame(draw);
  }

  scenes.forEach((s, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "scenario-btn" + (i === 0 ? " active" : "");
    btn.textContent = s.label;
    btn.addEventListener("click", () => {
      stop();
      apply(i);
    });
    buttons.appendChild(btn);
  });

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    playAll.textContent = "Play";
  }

  playAll.addEventListener("click", () => {
    if (timer) {
      stop();
      return;
    }
    playAll.textContent = "Stop";
    apply(0);
    timer = setInterval(() => apply((current + 1) % scenes.length), 2800);
  });
  document.getElementById("prevScene")?.addEventListener("click", () => {
    stop();
    apply((current - 1 + scenes.length) % scenes.length);
  });
  document.getElementById("nextScene")?.addEventListener("click", () => {
    stop();
    apply((current + 1) % scenes.length);
  });

  new ResizeObserver(() => draw()).observe(canvas);
  window.addEventListener("resize", () => requestAnimationFrame(draw));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => requestAnimationFrame(draw));
  }
  apply(0);
})();
