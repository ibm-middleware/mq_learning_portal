(function () {
  const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  const search = document.getElementById("search");
  const results = document.getElementById("searchResults");

  function closeNav() {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("show");
  }

  menuBtn?.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  });
  overlay?.addEventListener("click", closeNav);

  const index = window.SEARCH_INDEX || [];

  function renderResults(q) {
    const query = q.trim().toLowerCase();
    if (!query) {
      results.classList.remove("open");
      results.innerHTML = "";
      return;
    }
    const hits = index
      .filter((item) =>
        (item.title + " " + item.blurb + " " + item.tags)
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 8);
    if (!hits.length) {
      results.innerHTML = "<div style='padding:12px;color:#525252'>No matching pages.</div>";
      results.classList.add("open");
      return;
    }
    results.innerHTML = hits
      .map(
        (item) =>
          `<a href="${item.href}"><strong>${item.title}</strong><small>${item.blurb}</small></a>`
      )
      .join("");
    results.classList.add("open");
  }

  search?.addEventListener("input", (e) => renderResults(e.target.value));
  search?.addEventListener("focus", (e) => renderResults(e.target.value));
  document.addEventListener("click", (e) => {
    if (!results.contains(e.target) && e.target !== search) {
      results.classList.remove("open");
    }
  });

  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pre = btn.parentElement.querySelector("pre");
      try {
        await navigator.clipboard.writeText(pre.innerText);
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = "Copy"), 1400);
      } catch {
        btn.textContent = "Select text";
      }
    });
  });
})();
