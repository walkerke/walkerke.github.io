// #30DayMapChallenge 2026 gallery. Reads map-challenge-2026/maps.json and builds the page.
(function () {
  "use strict";

  var MANIFEST = "map-challenge-2026/maps.json";
  var TOTAL = 30;

  var $ = function (id) { return document.getElementById(id); };
  var grid = $("mc-grid"), strip = $("mc-strip"), filters = $("mc-filters");
  var progressLabel = $("mc-progress-label"), status = $("mc-status");
  var lb = $("mc-lb"), lbImg = $("mc-lb-img");

  var maps = [];
  var activeTag = null;
  var current = null;      // entry shown in the lightbox
  var returnFocus = null;  // element to refocus when the lightbox closes

  var pad = function (n) { return String(n).padStart(2, "0"); };
  var hashFor = function (d) { return "#day-" + pad(d); };

  function fmtDate(iso, opts) {
    var p = iso.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-US", opts);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "class") node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  var isPublished = function (m) { return m.status === "published" && m.image; };
  var isVisible = function (m) {
    return !activeTag || (isPublished(m) && (m.tags || []).indexOf(activeTag) !== -1);
  };
  var browsable = function () { return maps.filter(function (m) { return isPublished(m) && isVisible(m); }); };

  // ---- Build -------------------------------------------------------------

  function buildCard(m) {
    var li = el("li", { class: "mc-item", id: "day-" + pad(m.day) });
    var cap = function (extra) {
      return el("span", { class: "mc-cap" }, [
        el("span", { class: "mc-num", text: pad(m.day) }),
        el("span", { class: "mc-theme", text: m.theme }),
        extra
      ]);
    };

    if (isPublished(m)) {
      li.classList.add("mc-published");
      var img = el("img", {
        src: m.thumb || m.image, alt: m.alt || m.title || "",
        loading: "lazy", decoding: "async", width: "800", height: "450"
      });
      var btn = el("button", {
        type: "button", class: "mc-card",
        "aria-label": "Day " + m.day + ", " + m.theme + ": " + m.title + ". Open details"
      }, [
        el("span", { class: "mc-frame" }, [img, el("span", { class: "mc-overlay", "aria-hidden": "true", text: m.title })]),
        cap(null),
        el("span", { class: "mc-title-touch", "aria-hidden": "true", text: m.title })
      ]);
      btn.addEventListener("click", function () { open(m, btn); });
      li.appendChild(btn);
    } else {
      li.classList.add("mc-upcoming");
      li.appendChild(el("div", { class: "mc-frame mc-blank", "aria-hidden": "true" }, [
        el("span", { class: "mc-blank-num", text: pad(m.day) })
      ]));
      li.appendChild(cap(el("span", { class: "mc-when", text: "Coming " + fmtDate(m.date, { month: "short", day: "numeric" }) })));
    }
    return li;
  }

  function buildStrip() {
    strip.textContent = "";
    maps.forEach(function (m) {
      var a = el("a", {
        href: hashFor(m.day), tabindex: "-1",
        title: "Day " + m.day + ": " + m.theme + (isPublished(m) ? "" : " (coming soon)"),
        class: isPublished(m) ? "is-published" : ""
      });
      strip.appendChild(el("li", {}, [a]));
    });
  }

  function buildFilters() {
    var counts = {};
    maps.filter(isPublished).forEach(function (m) {
      (m.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    });
    var tags = Object.keys(counts).sort();
    if (!tags.length) return;

    var chip = function (label, tag, n) {
      var b = el("button", { type: "button", class: "mc-chip", "aria-pressed": String(activeTag === tag) },
        [document.createTextNode(label), n ? el("span", { class: "mc-chip-n", text: String(n) }) : null]);
      b.dataset.tag = tag || "";
      b.addEventListener("click", function () { setFilter(activeTag === tag ? null : tag); });
      return b;
    };
    filters.textContent = "";
    filters.appendChild(chip("All days", null, 0));
    tags.forEach(function (t) { filters.appendChild(chip(t, t, counts[t])); });
    filters.hidden = false;
  }

  function setFilter(tag) {
    activeTag = tag;
    Array.prototype.forEach.call(filters.children, function (b) {
      b.setAttribute("aria-pressed", String((b.dataset.tag || null) === tag));
    });
    maps.forEach(function (m) { $("day-" + pad(m.day)).hidden = !isVisible(m); });
    var n = browsable().length;
    status.textContent = tag ? "Showing " + n + " map" + (n === 1 ? "" : "s") + " tagged " + tag + "." : "";
  }

  function render() {
    var published = maps.filter(isPublished).length;
    progressLabel.innerHTML = "<strong>" + published + "</strong> of " + TOTAL + " maps published";
    buildStrip();
    buildFilters();
    grid.textContent = "";
    maps.forEach(function (m) { grid.appendChild(buildCard(m)); });
  }

  // ---- Lightbox ----------------------------------------------------------

  function show(m) {
    current = m;
    $("mc-lb-num").textContent = pad(m.day);
    $("mc-lb-theme").textContent = m.theme;
    $("mc-lb-title").textContent = m.title;
    $("mc-lb-date").textContent = fmtDate(m.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    $("mc-lb-blurb").textContent = m.blurb || "";

    var tags = $("mc-lb-tags");
    tags.textContent = "";
    (m.tags || []).forEach(function (t) { tags.appendChild(el("li", { text: t })); });
    tags.hidden = !(m.tags || []).length;

    var actions = $("mc-lb-actions");
    actions.textContent = "";
    if (m.live) actions.appendChild(el("a", { class: "mc-btn mc-btn-primary", href: m.live, target: "_blank", rel: "noopener", text: "Open interactive map" }));
    if (m.post) actions.appendChild(el("a", { class: "mc-btn mc-btn-secondary", href: m.post, target: "_blank", rel: "noopener", text: "View post" }));
    actions.appendChild(el("a", { class: "mc-lb-full", href: m.image, target: "_blank", rel: "noopener", text: "Full-size image" }));

    // Show the cached thumbnail right away, then swap in the larger image.
    lbImg.alt = m.alt || m.title || "";
    lbImg.src = m.thumb || m.image;
    if (m.thumb && m.image !== m.thumb) {
      var full = new Image();
      full.onload = function () { if (current === m) lbImg.src = m.image; };
      full.src = m.image;
    }

    var list = browsable(), i = list.indexOf(m);
    $("mc-lb-prev").disabled = i <= 0;
    $("mc-lb-next").disabled = i < 0 || i >= list.length - 1;
    $("mc-lb-pos").textContent = (i + 1) + " / " + list.length;
    [list[i - 1], list[i + 1]].forEach(function (n) { if (n) (new Image()).src = n.image; });

    history.replaceState(null, "", hashFor(m.day));
  }

  function open(m, from) {
    returnFocus = from || null;
    show(m);
    if (!lb.open) {
      document.documentElement.classList.add("mc-locked");
      lb.showModal();
      $("mc-lb-close").focus();
    }
  }

  function step(dir) {
    if (!current) return;
    var list = browsable(), i = list.indexOf(current) + dir;
    if (i >= 0 && i < list.length) show(list[i]);
  }

  lb.addEventListener("close", function () {
    document.documentElement.classList.remove("mc-locked");
    history.replaceState(null, "", location.pathname + location.search);
    var card = current && document.querySelector("#day-" + pad(current.day) + " .mc-card");
    (card || returnFocus || document.body).focus();
    current = null;
  });
  $("mc-lb-close").addEventListener("click", function () { lb.close(); });
  $("mc-lb-prev").addEventListener("click", function () { step(-1); });
  $("mc-lb-next").addEventListener("click", function () { step(1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) lb.close(); }); // click on backdrop
  lb.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
  });

  // ---- Deep links --------------------------------------------------------

  function fromHash() {
    var match = /^#day-(\d{1,2})$/.exec(location.hash);
    if (!match) return;
    var m = maps.filter(function (x) { return x.day === Number(match[1]); })[0];
    if (!m) return;
    if (isPublished(m)) {
      if (!isVisible(m)) setFilter(null);
      open(m, null);
    } else {
      if (activeTag) setFilter(null);
      var li = $("day-" + pad(m.day));
      li.scrollIntoView({ block: "center" });
      li.classList.add("is-target");
      setTimeout(function () { li.classList.remove("is-target"); }, 2200);
    }
  }
  window.addEventListener("hashchange", fromHash);

  // ---- Load --------------------------------------------------------------

  fetch(MANIFEST, { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      maps = data.slice().sort(function (a, b) { return a.day - b.day; });
      render();
      fromHash();
    })
    .catch(function () {
      progressLabel.textContent = "The map list didn't load. Refresh the page to try again.";
    });
})();
