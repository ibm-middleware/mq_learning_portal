(function () {
  const canvas = document.getElementById("intCanvas");
  const overlay = document.getElementById("intOverlay");
  const buttons = document.getElementById("intBtns");
  const playAll = document.getElementById("intPlay");
  if (!canvas || !buttons || !playAll || !overlay) return;

  const COLORS = {
    idle: "#c5d4cf",
    client: "#1A6B61",
    replica: "#2b6cb0",
    crr: "#6929c4",
    vault: "#c2410c",
  };

  const LSN = {
    prev: "0:0:10:99",
    now: "0:0:10:100",
    behind: "0:0:9:800",
    recov: "0:0:10:98",
  };

  const baseVals = {
    next: LSN.now,
    grp: LSN.prev,
    a: LSN.prev,
    b: LSN.prev,
    c: LSN.prev,
    q: "3/3",
    rc: "in UOW",
    blb: "0 KB",
    blc: "0 KB",
    synb: "Yes",
    sync: "Yes",
    rcov: LSN.prev,
    rbl: "0 KB",
    conngrp: "Yes",
    rstat: "Normal",
    rsync: "In-sync with Live",
  };

  function V(over) {
    return Object.assign({}, baseVals, over);
  }

  const fabric = [
    ["idle", "app", "right", "lsnr", "left"],
    ["idle", "lsnr", "right", "api", "left"],
    ["idle", "api", "bottom", "txn", "top"],
    ["idle", "txn", "bottom", "lsn", "top"],
    ["idle", "lsn", "bottom", "logrec", "top"],
    ["idle", "logrec", "bottom", "repl", "top"],
    ["idle", "repl", "bottom", "gate", "top"],
    ["idle", "gate", "bottom", "crr", "top"],
    ["idle", "crr", "bottom", "ckpt", "top"],
    ["idle", "ckpt", "bottom", "a-hb", "top"],
    ["idle", "repl", "left", "b-rx", "right"],
    ["idle", "repl", "right", "c-rx", "left"],
    ["idle", "b-rx", "bottom", "b-force", "top"],
    ["idle", "b-force", "bottom", "b-ack", "top"],
    ["idle", "b-ack", "bottom", "b-replay", "top"],
    ["idle", "b-replay", "bottom", "b-qfile", "top"],
    ["idle", "b-qfile", "bottom", "b-sync", "top"],
    ["idle", "b-sync", "bottom", "b-hb", "top"],
    ["idle", "c-rx", "bottom", "c-force", "top"],
    ["idle", "c-force", "bottom", "c-ack", "top"],
    ["idle", "c-ack", "bottom", "c-replay", "top"],
    ["idle", "c-replay", "bottom", "c-qfile", "top"],
    ["idle", "c-qfile", "bottom", "c-sync", "top"],
    ["idle", "c-sync", "bottom", "c-hb", "top"],
    ["idle", "b-ack", "right", "gate", "left"],
    ["idle", "c-ack", "left", "gate", "right"],
    ["idle", "gate", "top", "rc", "bottom"],
    ["idle", "a-hb", "left", "b-hb", "right"],
    ["idle", "a-hb", "right", "c-hb", "left"],
    ["idle", "crr", "right", "rec-rx", "left"],
    ["idle", "rec-rx", "bottom", "rec-force", "top"],
    ["idle", "rec-force", "bottom", "rec-fan", "top"],
    ["idle", "rec-fan", "bottom", "rec-r1", "top"],
    ["idle", "rec-fan", "bottom", "rec-r2", "top"],
    ["idle", "rec-r1", "bottom", "rec-rebase", "top"],
    ["idle", "rec-rebase", "bottom", "rec-sync", "top"],
  ];

  const scenes = [
    {
      id: "append",
      label: "1. Append LSN",
      note: "Persistent MQPUT/MQCMIT: runmqlsr accepts the SVRCONN, amqrmppa (channel pool) or amqcrsta hands the call to an LQM agent (amqzlaa0, or amqzlsa0 / amqzlwa0). The agent asks the log manager (amqhasmx; amqharmx formats the replicated/linear log) for the next LSN and builds the log record header.",
      vals: V({ a: LSN.prev, grp: LSN.prev, rc: "in UOW — not committed" }),
      rec: "hdr · type=PUT · LSN=" + LSN.now + " · prev=" + LSN.prev,
      on: ["app", "lsnr", "api", "txn", "lsn", "logrec"],
      hops: [
        ["client", "app", "right", "lsnr", "left", "TCP"],
        ["client", "lsnr", "right", "api", "left", "amqrmppa"],
        ["client", "api", "bottom", "txn", "top", "amqzlaa0"],
        ["client", "txn", "bottom", "lsn", "top", "amqhasmx"],
        ["client", "lsn", "bottom", "logrec", "top", "LSN"],
      ],
    },
    {
      id: "force",
      label: "2. Force local log",
      note: "amqhasmx appends into the current extent (default 16 MB = 4096 × 4 KB pages) and forces S0000001.LOG on the Active's RWO disk. Local force is not enough: the application is still in MQCMIT. hflag1 shows LOG REPLICATE. amqzllp0 will later checkpoint.",
      vals: V({ a: LSN.now, grp: LSN.prev, rc: "waiting on replicas" }),
      rec: "forced on S0000001.LOG · ACKLSN Active = " + LSN.now,
      on: ["logrec", "lsn", "ckpt"],
      hops: [
        ["client", "lsn", "bottom", "logrec", "top", "force"],
        ["client", "logrec", "bottom", "repl", "top"],
      ],
    },
    {
      id: "ship",
      label: "3. Sync :9414",
      note: "Native HA ships the same log record on the intra-group wire :9414 (NativeHAInstance ReplicationAddress). This is synchronous: MQCMIT does not return until a majority ACKLSN. Not shared disk. Each replica has its own RWO volume.",
      vals: V({ a: LSN.now, grp: LSN.prev, rc: "waiting on ACKLSN" }),
      rec: "sync replicate LSN " + LSN.now + " → live replica-1 and replica-2",
      on: ["repl", "b-rx", "c-rx", "logrec"],
      hops: [
        ["client", "logrec", "bottom", "repl", "top"],
        ["replica", "repl", "left", "b-rx", "right", ":9414"],
        ["replica", "repl", "right", "c-rx", "left", ":9414"],
      ],
    },
    {
      id: "ack",
      label: "4. Replica ACK",
      note: "Each replica's amqhasmx forces the record to its own recovery log. Native HA then returns ACKLSN. A replica that is not INSYNC cannot vote (catch-up BACKLOG in KB). amqzxma0 on the Active collects ACKLSN for the majority gate.",
      vals: V({ a: LSN.now, b: LSN.now, c: LSN.now, grp: LSN.prev, rc: "majority forming" }),
      rec: "Replica-1 ACKLSN=" + LSN.now + " · Replica-2 ACKLSN=" + LSN.now,
      on: ["b-rx", "b-force", "b-ack", "c-rx", "c-force", "c-ack", "gate"],
      hops: [
        ["replica", "b-rx", "bottom", "b-force", "top", "amqhasmx"],
        ["replica", "b-force", "bottom", "b-ack", "top", "ACKLSN"],
        ["replica", "c-rx", "bottom", "c-force", "top", "amqhasmx"],
        ["replica", "c-force", "bottom", "c-ack", "top", "ACKLSN"],
        ["replica", "b-ack", "right", "gate", "left", "ACK"],
        ["replica", "c-ack", "left", "gate", "right", "ACK"],
      ],
    },
    {
      id: "commit",
      label: "5. Majority commit",
      note: "When 2 of 3 live instances have ACKLSN ≥ this LSN, GRPLSN advances and amqrmppa returns MQCMIT (RPO 0 inside the Live group). CRR is asynchronous: the application is NOT waiting on the Recovery group. Raft guarantees any future Live leader already has this record.",
      vals: V({ a: LSN.now, b: LSN.now, c: LSN.now, grp: LSN.now, rc: "MQCC_OK · committed" }),
      rec: "GRPLSN=" + LSN.now + " · majority durable · MQCMIT (CRR still in flight)",
      on: ["gate", "api", "rc", "repl", "b-ack", "c-ack", "crr"],
      hops: [
        ["crr", "b-ack", "right", "gate", "left", "2 of 3"],
        ["crr", "c-ack", "left", "gate", "right", "2 of 3"],
        ["crr", "gate", "top", "rc", "bottom", "MQCC_OK"],
      ],
    },
    {
      id: "replay",
      label: "6. Replay queues",
      note: "Replication is log-only. amqzllp0 (checkpoint processor) on each replica replays the local log into queue files, QMQMOBJCAT, and syncfiles. Media images (IMGINTVL 60 min, IMGLOGLN 25% of log FS) sit in the log so a replica can recreate objects then roll forward.",
      vals: V({ a: LSN.now, b: LSN.now, c: LSN.now, grp: LSN.now, rc: "MQCC_OK · committed" }),
      rec: "amqzllp0 replay PUT @ " + LSN.now + " → QMQMOBJCAT",
      on: ["b-ack", "b-replay", "b-qfile", "b-sync", "c-ack", "c-replay", "c-qfile", "c-sync", "ckpt"],
      hops: [
        ["vault", "b-ack", "bottom", "b-replay", "top", "amqzllp0"],
        ["vault", "b-replay", "bottom", "b-qfile", "top", "QMQMOBJCAT"],
        ["vault", "c-ack", "bottom", "c-replay", "top", "amqzllp0"],
        ["vault", "c-replay", "bottom", "c-qfile", "top", "QMQMOBJCAT"],
      ],
    },
    {
      id: "catchup",
      label: "7. Catch-up",
      note: "A restarted live replica is sent older extents on :9414 until ACKLSN catches GRPLSN. BACKLOG is KB still to send. During catch-up that replica cannot vote, so QUORUM is 2/3 even if three processes are up. Live still serves.",
      vals: V({
        a: LSN.now, b: LSN.now, c: LSN.behind, grp: LSN.now, q: "2/3",
        rc: "still serving (majority holds)", blc: "384 KB", sync: "No",
      }),
      rec: "catch-up stream · Replica-2 BACKLOG > 0 · INSYNC(No)",
      on: ["repl", "c-rx", "c-force", "c-sync", "c-hb"],
      hops: [
        ["vault", "repl", "right", "c-rx", "left", "catch-up"],
        ["vault", "c-rx", "bottom", "c-force", "top", "BACKLOG"],
      ],
    },
    {
      id: "elect",
      label: "8. Elect best log",
      note: "If the Active misses heartbeats (amqzxma0, default 5000 ms, timeout 2×), live replicas elect the instance with the highest durable LSN. Winner becomes Active; amqzllp0 undoes unprepared UOWs and redos from the log; amqzmur0 (restartable process manager) starts only on the new Active. Two failures → QUORUM 1/3: no Active.",
      vals: V({
        a: "—", b: LSN.now, c: LSN.now, grp: LSN.now, q: "2/3",
        rc: "reconnect to new Active", synb: "Elected",
      }),
      rec: "Replica-1 ACKLSN highest · elected Active · amqzllp0 redo/undo",
      on: ["b-qfile", "b-replay", "b-ack", "b-sync", "b-hb", "gate", "api", "c-hb", "a-hb", "ckpt"],
      hops: [
        ["vault", "a-hb", "left", "b-hb", "right", "missed HB"],
        ["crr", "b-hb", "right", "c-hb", "left", "elect"],
        ["crr", "b-ack", "right", "gate", "left", "best log"],
        ["crr", "gate", "top", "rc", "bottom", "new Active"],
      ],
    },
    {
      id: "async",
      label: "9. Async CRR",
      note: "After local majority, Native HA CRR ships the log asynchronously to the Recovery group leader on GroupLocalAddress :9415 (TLS mandatory between groups). Live does not wait — MQCMIT already returned. Recovery leader (ROLE(Leader), no app connections) writes with amqhasmx and fans out synchronously on :9414 to its two replicas. RPO ≥ 0 on unplanned failover. NativeHARecoveryGroup SyncReplication=No.",
      vals: V({
        a: LSN.now, b: LSN.now, c: LSN.now, grp: LSN.now,
        rc: "MQCC_OK · CRR in flight", rcov: LSN.recov, rbl: "12 KB",
        rsync: "catching Live", rstat: "Synchronizing",
      }),
      rec: "async CRR LSN " + LSN.now + " → recovery leader :9415",
      on: ["crr", "gate", "rec-rx", "rec-force", "rec-fan", "rec-r1", "rec-r2"],
      hops: [
        ["crr", "gate", "bottom", "crr", "top"],
        ["crr", "crr", "right", "rec-rx", "left", "async :9415"],
        ["crr", "rec-rx", "bottom", "rec-force", "top", "amqhasmx"],
        ["crr", "rec-force", "bottom", "rec-fan", "top", ":9414"],
        ["replica", "rec-fan", "bottom", "rec-r1", "top", "rec-1"],
        ["replica", "rec-fan", "bottom", "rec-r2", "top", "rec-2"],
      ],
    },
    {
      id: "rebase",
      label: "10. Rebase",
      note: "If the Live group reused log extents the Recovery group still needed, catch-up on :9415 is impossible. The recovery leader rebases: it takes a backup log (CRR needs ~2× storage), discards received log data, and rebuilds the queue manager from a complete log set sent by Live (AMQ3271/AMQ3286). Then it replicates that log to recovery replicas on :9414.",
      vals: V({
        a: LSN.now, b: LSN.now, c: LSN.now, grp: LSN.now,
        rc: "MQCC_OK · Live unaffected", rcov: LSN.behind, rbl: "rebuild",
        conngrp: "Yes", rstat: "Rebasing", rsync: "rebase in progress",
      }),
      rec: "rebase · discard recovery log · rebuild from Live full set",
      on: ["crr", "rec-rx", "rec-rebase", "rec-force", "rec-sync", "rec-fan"],
      hops: [
        ["vault", "crr", "right", "rec-rx", "left", "full log"],
        ["vault", "rec-rx", "bottom", "rec-rebase", "top", "rebase"],
        ["vault", "rec-rebase", "bottom", "rec-sync", "top", "rebuild"],
      ],
    },
  ];

  let current = 0;
  let timer = null;

  function box(name) {
    const el = canvas.querySelector('[data-anchor="' + name + '"]');
    if (!el || !overlay) return null;
    const ico = el.querySelector(".svc-ico") || el;
    const a = ico.getBoundingClientRect();
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

  function elbow(a, b) {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    if (dy < 8 || dx < 8) {
      return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    if (dy >= dx) {
      const midY = (a.y + b.y) / 2;
      return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${a.x.toFixed(1)} ${midY.toFixed(1)} L ${b.x.toFixed(1)} ${midY.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    const midX = (a.x + b.x) / 2;
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${midX.toFixed(1)} ${a.y.toFixed(1)} L ${midX.toFixed(1)} ${b.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }

  function labelAt(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function hopsOf(list) {
    const out = [];
    list.forEach((h) => {
      const [kind, from, fe, to, te, label] = h;
      const a = pt(from, fe);
      const b = pt(to, te);
      if (a && b) out.push({ kind, d: elbow(a, b), label, at: labelAt(a, b) });
    });
    return out;
  }

  function draw() {
    const w = Math.max(canvas.clientWidth, canvas.scrollWidth);
    const h = Math.max(canvas.clientHeight, canvas.scrollHeight);
    overlay.setAttribute("viewBox", `0 0 ${w} ${h}`);
    overlay.setAttribute("width", w);
    overlay.setAttribute("height", h);
    const scene = scenes[current];
    const idle = hopsOf(fabric);
    const live = hopsOf(scene.hops);
    const defs = Object.entries(COLORS)
      .map(
        ([k, col]) =>
          `<marker id="im-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${col}"/></marker>`
      )
      .join("");
    const idlePaths = idle.map((h) => `<path class="flow-path idle" d="${h.d}"/>`).join("");
    const livePaths = live
      .map(
        (h) =>
          `<path class="flow-path ${h.kind} pulse" marker-end="url(#im-${h.kind})" d="${h.d}"/>`
      )
      .join("");
    const labels = live
      .filter((h) => h.label)
      .map((h) => {
        const col = COLORS[h.kind] || COLORS.client;
        const tw = Math.max(52, h.label.length * 6.2 + 12);
        return `<rect x="${(h.at.x - tw / 2).toFixed(1)}" y="${(h.at.y - 9).toFixed(1)}" width="${tw.toFixed(1)}" height="16" rx="8" fill="#fff" stroke="${col}" stroke-width="1"/><text x="${h.at.x.toFixed(1)}" y="${(h.at.y + 3.5).toFixed(1)}" text-anchor="middle" fill="${col}" class="flow-lbl">${h.label}</text>`;
      })
      .join("");
    overlay.innerHTML = `<defs>${defs}</defs>${idlePaths}${livePaths}${labels}`;
  }

  function apply(i) {
    current = i;
    const s = scenes[i];
    canvas.className = "arch-canvas algo-canvas scene-" + s.id;
    canvas.querySelectorAll(".svc").forEach((el) => el.classList.remove("on", "warn"));
    (s.on || []).forEach((id) => {
      const el = canvas.querySelector('[data-anchor="' + id + '"]');
      if (el) el.classList.add("on");
    });
    const v = s.vals;
    setText("v-next", v.next);
    setText("v-grp", v.grp);
    setText("v-a", v.a);
    setText("v-b", v.b);
    setText("v-c", v.c);
    setText("v-q", v.q);
    setText("v-rc", v.rc);
    setText("v-rec", s.rec);
    setText("v-back-b", "ACK " + v.b);
    setText("v-back-c", "ACK " + v.c);
    setText("v-bl-b", v.blb);
    setText("v-bl-c", v.blc);
    setText("v-sync-b", v.synb);
    setText("v-sync-c", v.sync);
    setText("v-rcov", v.rcov);
    setText("v-rbl", v.rbl);
    setText("v-conngrp", v.conngrp);
    setText("v-rstat", v.rstat);
    setText("v-rsync", v.rsync);
    canvas.querySelector('[data-anchor="c-sync"]')?.classList.toggle("warn", s.id === "catchup");
    canvas.querySelector('[data-anchor="a-hb"]')?.classList.toggle("warn", s.id === "elect");
    canvas.querySelector('[data-anchor="rec-sync"]')?.classList.toggle("warn", s.id === "rebase");
    const note = document.getElementById("intNote");
    if (note) note.textContent = s.note;
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
    timer = setInterval(() => apply((current + 1) % scenes.length), 3800);
  });
  document.getElementById("intPrev")?.addEventListener("click", () => {
    stop();
    apply((current - 1 + scenes.length) % scenes.length);
  });
  document.getElementById("intNext")?.addEventListener("click", () => {
    stop();
    apply((current + 1) % scenes.length);
  });

  new ResizeObserver(() => draw()).observe(canvas);
  window.addEventListener("resize", () => requestAnimationFrame(draw));
  apply(0);
})();

