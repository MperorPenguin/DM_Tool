/* Tiny utilities for TOC, deep links, search, expand/collapse, and print */
(function () {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const tocEl = $("#toc");
  const queryEl = $("#q");
  const btnExpand = $("#btn-expand");
  const btnCollapse = $("#btn-collapse");
  const btnPrint = $("#btn-print");

  // Build TOC from h2s
  const sections = $$(".doc h2").map(h => {
    // add little anchor link
    if (!h.querySelector(".anchor")) {
      const a = document.createElement("a");
      a.href = `#${h.id}`;
      a.textContent = "§ link";
      a.className = "anchor";
      h.appendChild(a);
    }
    return { id: h.id, text: h.textContent.trim(), el: h.closest("section") };
  });

  function renderTOC(activeId) {
    tocEl.innerHTML = "";
    sections.forEach(s => {
      const a = document.createElement("a");
      a.href = `#${s.id}`;
      a.textContent = s.text;
      if (activeId && activeId === s.id) a.setAttribute("aria-current", "true");
      tocEl.appendChild(a);
    });
  }
  renderTOC(location.hash.replace("#", ""));

  // Highlight current section on hash change and scroll
  function setActiveFromHash() {
    const id = location.hash.replace("#", "");
    renderTOC(id);
  }
  window.addEventListener("hashchange", setActiveFromHash, { passive: true });

  // Search: filters details/sections by text; highlights matches
  function clearMarks(node) {
    $$(".mark-wrap", node).forEach(w => {
      w.replaceWith(...w.childNodes);
    });
    $$("mark", node).forEach(m => {
      m.replaceWith(...m.childNodes);
    });
  }
  function highlight(node, term) {
    if (!term) return;
    const rx = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "ig");
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    const toReplace = [];
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (t.nodeValue.match(rx) && t.nodeValue.trim().length) toReplace.push(t);
    }
    toReplace.forEach(t => {
      const frag = document.createElement("span");
      frag.className = "mark-wrap";
      frag.innerHTML = t.nodeValue.replace(rx, "<mark>$1</mark>");
      t.replaceWith(frag);
    });
  }
  function applySearch() {
    const term = queryEl.value.trim();
    const articles = $$(".doc section");
    articles.forEach(sec => {
      clearMarks(sec);
      const text = sec.textContent.toLowerCase();
      const match = !term || text.includes(term.toLowerCase());
      sec.style.display = match ? "" : "none";
      if (match && term) highlight(sec, term);
    });
  }
  queryEl?.addEventListener("input", applySearch);

  // Expand/collapse all details
  btnExpand?.addEventListener("click", () => $$("details").forEach(d => d.open = true));
  btnCollapse?.addEventListener("click", () => $$("details").forEach(d => d.open = false));

  // Print / Save as PDF
  btnPrint?.addEventListener("click", () => window.print());

  // Last updated (from file mtime if available, else today)
  const last = new Date(document.lastModified || Date.now());
  $("#last-updated").textContent = last.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });

  // Ensure correct TOC highlight on load
  setActiveFromHash();
})();
