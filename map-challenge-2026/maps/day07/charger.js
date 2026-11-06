// Day 7: click anywhere (or search a place) to draw the 10-minute drive from that spot and count the public DC fast
// charging locations inside it. Click a charger to draw its own 10-minute drive area. One Mapbox Isochrone request per click.
(function () {
  function attach(map, cfg) {
    var panel = document.getElementById("ch-panel");
    var locs = null, seq = 0;
    var empty = { type: "FeatureCollection", features: [] };
    // one entry per charging location: station records at the same spot (about 10 m) are merged, as in prep_isochrones.R
    fetch(cfg.stations).then(function (r) { return r.json(); }).then(function (g) {
      var by = {};
      g.features.forEach(function (f) {
        var c = f.geometry.coordinates, k = c[0].toFixed(4) + "," + c[1].toFixed(4);
        if (!by[k]) by[k] = { type: "Feature", geometry: f.geometry, properties: { kind: "charger" } };
      });
      locs = Object.keys(by).map(function (k) { return by[k]; });
    });

    map.addSource("click-iso", { type: "geojson", data: empty });
    map.addSource("click-pts", { type: "geojson", data: empty });
    map.addLayer({ id: "click-iso-fill", type: "fill", source: "click-iso", paint: { "fill-color": cfg.isoColor, "fill-opacity": 0.22, "fill-emissive-strength": 1 } });
    map.addLayer({ id: "click-iso-line", type: "line", source: "click-iso", paint: { "line-color": cfg.isoColor, "line-width": 2, "line-emissive-strength": 1 } });
    map.addLayer({ id: "click-pts", type: "circle", source: "click-pts",
                   paint: { "circle-radius": 6,
                            "circle-color": ["case", ["==", ["get", "kind"], "origin"], "#ffffff", cfg.hitColor],
                            "circle-stroke-color": "#13222b", "circle-stroke-width": 2, "circle-emissive-strength": 1 } });

    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function show(html) { panel.innerHTML = html + '<br><button type="button">Clear</button>'; panel.style.display = "block"; panel.querySelector("button").onclick = reset; }
    function reset() {
      seq++;
      ["click-iso", "click-pts"].forEach(function (s) { map.getSource(s).setData(empty); });
      panel.style.display = "none";
    }
    function pt(xy, kind) { return { type: "Feature", properties: { kind: kind }, geometry: { type: "Point", coordinates: xy } }; }
    // point in polygon (ray casting) over every ring of a Polygon or MultiPolygon; holes flip the result
    function inRing(p, r) {
      var inside = false;
      for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
        if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
      }
      return inside;
    }
    function inGeom(p, g) {
      var polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      return polys.some(function (poly) { return poly.reduce(function (a, r) { return inRing(p, r) ? !a : a; }, false); });
    }
    function iso(xy) {
      return fetch("https://api.mapbox.com/isochrone/v1/mapbox/driving/" + xy[0].toFixed(6) + "," + xy[1].toFixed(6) +
                   "?contours_minutes=10&polygons=true&denoise=1&access_token=" + mapboxgl.accessToken)
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    }
    var fail = "Couldn't reach the routing service. Try again.";

    // a place: where you can drive in 10 minutes from here, and the charging locations inside that area
    function lookup(ll, label) {
      if (!locs) return;
      var my = ++seq, xy = [ll.lng, ll.lat], head = label ? "<b>" + esc(label) + "</b><br>" : "";
      map.getSource("click-iso").setData(empty);
      map.getSource("click-pts").setData({ type: "FeatureCollection", features: [pt(xy, "origin")] });
      show(head + "Drawing the 10-minute drive…");
      iso(xy).then(function (g) {
        if (my !== seq) return;
        map.getSource("click-iso").setData(g);
        var geom = g.features && g.features[0] && g.features[0].geometry;
        var hits = geom ? locs.filter(function (f) { return inGeom(f.geometry.coordinates, geom); }) : [];
        map.getSource("click-pts").setData({ type: "FeatureCollection", features: hits.concat([pt(xy, "origin")]) });
        show(head + (hits.length === 0 ? "No public DC fast chargers within a 10-minute drive."
          : "<b>" + hits.length + "</b> public DC fast charging location" + (hits.length === 1 ? "" : "s") + " within a 10-minute drive.") +
          "<br><span class=\"ch-sub\">Shaded: where you can drive in 10 minutes from this spot.</span>");
      }).catch(function () { if (my === seq) show(head + fail); });
    }

    // a charger: its own 10-minute drive area, the same request as the statewide layer, so it lines up with it
    function pickCharger(f) {
      var my = ++seq, c = f.geometry.coordinates, p = f.properties;
      var head = "<b>" + esc(p.name) + "</b>, " + esc(p.city) + "<br><span class=\"ch-sub\">" + esc(p.ports) + " fast charging port" +
        (p.ports == 1 ? "" : "s") + (p.network && p.network !== "Non-Networked" ? " · " + esc(p.network) : "") + "</span><br>";
      map.getSource("click-iso").setData(empty);
      map.getSource("click-pts").setData({ type: "FeatureCollection", features: [pt(c, "charger")] });
      show(head + "Drawing its 10-minute drive area…");
      iso(c).then(function (g) {
        if (my !== seq) return;
        map.getSource("click-iso").setData(g);
        show(head + "Shaded: everywhere you can drive in 10 minutes from this charger.");
      }).catch(function () { if (my === seq) show(head + fail); });
    }
    function chargerAt(px) {
      var hits = map.queryRenderedFeatures([[px.x - 6, px.y - 6], [px.x + 6, px.y + 6]], { layers: ["stations"] });
      if (!hits.length) return null;
      var d = function (f) { var q = map.project(f.geometry.coordinates); return Math.hypot(q.x - px.x, q.y - px.y); };
      return hits.sort(function (a, b) { return d(a) - d(b); })[0];
    }

    map.on("click", function (e) { var f = chargerAt(e.point); if (f) pickCharger(f); else lookup(e.lngLat, null); });
    map.on("mouseenter", "stations", function () { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "stations", function () { map.getCanvas().style.cursor = ""; });
    (map.controls || []).forEach(function (c) {
      if (c && typeof c.on === "function" && c.constructor && /Geocoder/.test(c.constructor.name || "")) {
        c.on("result", function (e) {
          var g = e.result && e.result.center; if (!g) return;
          lookup({ lng: g[0], lat: g[1] }, e.result.place_name);
        });
      }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") reset(); });
    window.demoCharger = { lookup: lookup, pickCharger: pickCharger, reset: reset };
  }
  window.ChargerLookup = { attach: attach };
})();
