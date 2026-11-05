// Day 5: show one turbine's viewshed when it is clicked. No analysis happens here: each turbine's
// viewshed was computed in R with terra::viewshed (compute_viewsheds.R) and saved as web/vs/<case_id>.png
// on a Web Mercator grid; this swaps that image into the "vs-one-src" image source.
(function () {
  function attach(map, cfg) {
    const panel = document.getElementById("vs-panel");
    let current = null, lastClick = 0;
    // one legend per state: tip counts for all turbines, or the selected turbine's viewshed
    const legends = function (one) {
      const a = document.getElementById(cfg.legendAll), b = document.getElementById(cfg.legendOne);
      if (a) a.style.display = one ? "none" : "block";
      if (b) b.style.display = one ? "block" : "none";   // hidden in CSS until a turbine is selected
    };
    const highlight = function (id) {
      const sel = ["==", ["get", "case_id"], id == null ? -1 : id];
      cfg.modelLayers.forEach(function (l) {
        map.setPaintProperty(l, "model-color", ["case", sel, cfg.highlight, "#ffffff"]);
        map.setPaintProperty(l, "model-color-mix-intensity", ["case", sel, 0.85, 0]);
      });
      map.setPaintProperty("turbine-dots", "circle-color", ["case", sel, cfg.highlight, "#ffffff"]);
    };
    const reset = function () {
      current = null;
      map.setPaintProperty("vs-one", "raster-opacity", 0);
      map.setPaintProperty("vs-all", "raster-opacity", cfg.allOpacity);
      highlight(null);
      legends(false);
      if (panel) panel.style.display = "none";
      window.demoSelected = null;
    };
    const show = function (p) {
      lastClick = Date.now();
      if (current === p.case_id) return;
      current = p.case_id;
      map.getSource("vs-one-src").updateImage({
        url: cfg.dir + "/" + p.case_id + ".png",
        coordinates: [[p.img_w, p.img_n], [p.img_e, p.img_n], [p.img_e, p.img_s], [p.img_w, p.img_s]]
      });
      map.setPaintProperty("vs-all", "raster-opacity", 0);
      map.setPaintProperty("vs-one", "raster-opacity", cfg.oneOpacity);
      highlight(p.case_id);
      legends(true);
      window.demoSelected = { case_id: p.case_id, mi2: p.mi2, near: p.mi2_near, mid: p.mi2_mid, far: p.mi2_far };
      if (panel) {
        const f = function (x) { return Number(x).toLocaleString("en-US"); };
        panel.innerHTML = "<b>Where this turbine is in sight</b><br>Its blade tip is in line of sight from about " +
          f(p.mi2) + " sq mi of ground within " + cfg.radiusMi + " miles:" +
          "<br>" + f(p.mi2_near) + " sq mi within 10 mi<br>" + f(p.mi2_mid) + " sq mi at 10–20 mi<br>" + f(p.mi2_far) + " sq mi at 20–25 mi" +
          "<br><button type=\"button\">Back to all turbines</button>";
        panel.style.display = "block";
        panel.querySelector("button").onclick = reset;
      }
    };
    ["turbine-dots", "turbine-hit"].forEach(function (layer) {
      map.on("click", layer, function (e) { if (e.features && e.features.length) show(e.features[0].properties); });
      map.on("mouseenter", layer, function () { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, function () { map.getCanvas().style.cursor = ""; });
    });
    // a click away from any turbine goes back to the all-turbines layer
    map.on("click", function () { setTimeout(function () { if (current != null && Date.now() - lastClick > 150) reset(); }, 0); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && current != null) reset(); });
    window.demoViewshed = { show: show, reset: reset };
  }
  window.TurbineViewshed = { attach: attach };
})();
