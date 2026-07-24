import type { ThemeColors } from "@/contexts/theme";
import { LT_BORDER_RINGS } from "@/lib/lt-border";

// The map tab renders a MapLibre GL map inside a WebView rather than a
// native map view: works identically in Expo Go and EAS builds on both
// platforms, needs no API key (vector tiles from OpenFreeMap), and gives
// full CSS control over the hotspot/letter markers so they can match the
// app's paper aesthetic.
//
// MapLibre (GPU, vector) replaced Leaflet (DOM, raster) deliberately:
// raster tiles reload at every integer zoom and Leaflet's SVG renderer
// clips vectors to the viewport (the Lithuania mask visibly vanished
// mid-drag). Vector rendering redraws every frame, so panning/zooming is
// smooth and the mask is always complete.
//
// Zoomed out, letters aggregate into hotspot circles; zoomed in, each one
// is a mini letter — actual paper card, typewriter font, the text itself
// and who left it — readable in place without opening anything.
//
//   - Short letters show in full, so there's nothing left to "open" by
//     reading: a single tap goes straight to the contact prompt on the
//     detail screen, while a double-tap within the window instead pops a
//     big heart right where the finger landed and toggles the like (a
//     second double-tap removes it).
//   - Long letters show clamped with a "read on" hint; a single tap opens
//     the detail screen to read, where the same double-tap-to-like/unlike
//     lives.
//   - Your own letters are always openable (that's where delete lives)
//     and never likeable.
//
// One-finger zoom: tap, then tap-and-hold and drag — down zooms in, up
// zooms out — on the bare map only, never on a letter.
//
// RN <-> web contract:
//   web -> RN (window.ReactNativeWebView.postMessage, JSON):
//     { type: "ready" }                    — map booted, safe to inject data
//     { type: "letterTap", id, openRequest }  — open the detail screen;
//       openRequest is true when a short letter's single tap should land
//       straight on the contact-the-author form instead of the plain read view
//     { type: "likeTap", id }              — double-tap on a short letter; toggles like/unlike server-side
//     { type: "placePick", lat, lng }      — user tapped a spot in place mode
//   RN -> web (injectJavaScript):
//     window.setLetters([{ id, lat, lng, own, likes, body, nick }])
//     window.setPlaceMode(true | false)
//     window.flyTo(lat, lng)               — pan/zoom to a searched place

// Lithuania bounding box — mirrors the CHECK constraint in migration 031.
export const LITHUANIA_BOUNDS = {
  south: 53.85,
  north: 56.5,
  west: 20.85,
  east: 26.9,
};

export interface MapHtmlLetter {
  id: string;
  lat: number;
  lng: number;
  own: boolean;
  likes: number;
  body: string;
  nick: string;
}

export function buildMapHtml(colors: ThemeColors): string {
  const b = LITHUANIA_BOUNDS;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css" />
<script src="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js"></script>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Special+Elite&display=swap" />
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; background: ${colors.bg}; }
  /* Warm the neutral basemap toward the app's paper palette. */
  .maplibregl-canvas { filter: sepia(0.22) saturate(0.85) brightness(1.02); }
  .maplibregl-ctrl-attrib {
    background: rgba(243, 237, 225, 0.8) !important;
    color: ${colors.subtext}; font-size: 9px;
  }
  .maplibregl-ctrl-attrib a { color: ${colors.subtext}; }

  /* Mini letter: the letter itself, readable on the map. Same visual
     language as the in-app letter paper — warm sheet, typewriter font,
     signature. The outer marker element is positioned by MapLibre, so all
     decoration and animation lives here to avoid fighting its transform. */
  .card {
    position: relative;
    width: 168px;
    background: ${colors.surfaceAlt};
    border: 1.5px solid ${colors.border};
    border-radius: 7px;
    box-shadow: 0 3px 8px rgba(43, 35, 32, 0.28);
    padding: 9px 11px 7px;
    font-family: "Special Elite", "Courier New", monospace;
    color: ${colors.text};
    transform: rotate(var(--rot));
    animation: bob 3.6s ease-in-out infinite;
    animation-delay: var(--delay);
  }
  .card.own { border-color: ${colors.accent}; }
  /* A well-loved letter glows softly. Kept subtle on purpose — the map
     must never read as a ranking. */
  .card.loved {
    box-shadow: 0 0 14px 2px ${colors.accent}66, 0 3px 8px rgba(43, 35, 32, 0.28);
  }
  .ctext {
    font-size: 10.5px;
    line-height: 15px;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .ctext.clamp {
    display: -webkit-box;
    -webkit-line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .cfoot {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 6px; margin-top: 6px;
  }
  .csig {
    font-size: 9.5px; color: ${colors.subtext};
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .clikes { font-size: 9.5px; color: ${colors.accent}; white-space: nowrap; }
  .cmore { font-size: 9px; color: ${colors.subtext}; margin-top: 3px; font-family: system-ui, sans-serif; }
  @keyframes bob {
    0%, 100% { transform: translateY(0) rotate(var(--rot)); }
    50%      { transform: translateY(-3px) rotate(var(--rot)); }
  }

  /* Double-tap heart burst: pops where the finger landed, then floats off. */
  .burst {
    position: absolute; z-index: 2000; pointer-events: none;
    font-size: 64px; color: ${colors.accent};
    text-shadow: 0 2px 8px rgba(43, 35, 32, 0.3);
    transform: translate(-50%, -50%) scale(0);
    animation: pop 0.9s ease forwards;
  }
  @keyframes pop {
    0%   { transform: translate(-50%, -50%) scale(0);    opacity: 1; }
    30%  { transform: translate(-50%, -50%) scale(1.2);  opacity: 1; }
    55%  { transform: translate(-50%, -50%) scale(1);    opacity: 1; }
    100% { transform: translate(-50%, calc(-50% - 26px)) scale(1); opacity: 0; }
  }

  /* Hotspot: soft warm circle with a letter count, gently breathing. */
  .hot {
    background: radial-gradient(circle, ${colors.accent} 0%, ${colors.accent} 55%, rgba(150, 21, 13, 0.55) 100%);
    border: 2px solid ${colors.surfaceAlt};
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(43, 35, 32, 0.3);
    display: flex; align-items: center; justify-content: center;
    color: ${colors.accentText}; font-weight: 700;
    font-family: system-ui, sans-serif;
    animation: breathe 3.5s ease-in-out infinite;
  }
  @keyframes breathe {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.07); }
  }

  /* Placement pin: a wax-seal drop marking the picked spot. */
  .pick {
    width: 40px; height: 40px;
    background: ${colors.accent};
    border: 2.5px solid ${colors.surfaceAlt};
    border-radius: 50% 50% 50% 4px;
    transform: rotate(-45deg);
    box-shadow: 0 3px 8px rgba(43, 35, 32, 0.4);
    display: flex; align-items: center; justify-content: center;
    animation: drop 0.25s ease-out;
  }
  .pick span { transform: rotate(45deg); font-size: 17px; }
  @keyframes drop {
    from { transform: rotate(-45deg) translate(-14px, -14px); opacity: 0; }
    to   { transform: rotate(-45deg) translate(0, 0); opacity: 1; }
  }
</style>
</head>
<body>
<div id="map"></div>
<script>
  // NOTE: MapLibre zoom levels run one lower than Leaflet's for the same
  // scale (512px world tile vs 256px) — these thresholds account for that.
  var CARD_ZOOM = 12;         // at/above this zoom letters are readable mini-letters
  var CLUSTER_CELL_PX = 72;   // hotspot grid cell size in screen pixels
  var LOVED_LIKES = 10;       // likes at which a letter starts to glow
  var SHORT_MAX = 180;        // chars up to which a letter shows in full (not openable)
  var DOUBLE_TAP_MS = 320;

  function send(msg) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  // User content goes into marker DOM — escape it.
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var BOUNDS = [[${b.west}, ${b.south}], [${b.east}, ${b.north}]]; // [lng, lat]

  var map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/positron",
    bounds: BOUNDS,
    maxBounds: [[${b.west - 0.25}, ${b.south - 0.15}], [${b.east + 0.25}, ${b.north + 0.15}]],
    minZoom: 5.5,
    maxZoom: 17.5,
    doubleClickZoom: false, // double taps belong to liking / the zoom drag
    dragRotate: false,
    pitchWithRotate: false,
    attributionControl: { compact: true },
  });
  map.touchZoomRotate.disableRotation();
  map.touchPitch.disable();

  // Crop the neighbours, in two parts:
  //  1. A solid paper-colored fill over every fill/line feature (land,
  //     water, roads) that isn't Lithuania, plus a delicate border outline
  //     — inserted *below* the basemap's label layers rather than appended
  //     on top, so it can never paint over a label.
  //  2. Every label/POI layer gets a spatial filter that drops features
  //     whose point falls outside the exact border, so a foreign place
  //     name (e.g. Sovetsk, just over the Russian side) is genuinely never
  //     drawn — not hidden under paint — while a Lithuanian town right on
  //     the coast (e.g. Palanga) still renders its label in full even
  //     where the text overhangs the sea, since nothing sits on top of it.
  // Rings are simplified to ~400 m.
  var LT_RINGS_LATLNG = ${JSON.stringify(LT_BORDER_RINGS)};
  var ltRings = LT_RINGS_LATLNG.map(function (ring) {
    var r = ring.map(function (p) { return [p[1], p[0]]; });
    r.push(r[0]); // close the ring, GeoJSON-style
    return r;
  });
  var MASK_OUTER = [[15, 50], [32, 50], [32, 59], [15, 59], [15, 50]];
  var LT_MULTIPOLYGON = {
    type: "MultiPolygon",
    coordinates: ltRings.map(function (r) { return [r]; }),
  };

  map.on("load", function () {
    var baseLayers = map.getStyle().layers || [];
    var firstSymbolId;
    for (var i = 0; i < baseLayers.length; i++) {
      if (baseLayers[i].type === "symbol") { firstSymbolId = baseLayers[i].id; break; }
    }

    map.addSource("lt-mask", {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [MASK_OUTER].concat(ltRings) },
      },
    });
    map.addLayer({
      id: "lt-mask-fill",
      type: "fill",
      source: "lt-mask",
      paint: { "fill-color": "${colors.bg}", "fill-opacity": 1 },
    }, firstSymbolId);
    map.addSource("lt-border", {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: { type: "MultiLineString", coordinates: ltRings },
      },
    });
    map.addLayer({
      id: "lt-border-line",
      type: "line",
      source: "lt-border",
      paint: { "line-color": "${colors.subtext}", "line-width": 1.2, "line-opacity": 0.45 },
    }, firstSymbolId);

    // Drop every label/POI feature outside the exact border so foreign
    // place names never draw at all, instead of relying on paint order.
    baseLayers.forEach(function (layer) {
      if (layer.type !== "symbol" && layer.type !== "circle") return;
      var existing = map.getFilter(layer.id);
      var withinLt = ["within", LT_MULTIPOLYGON];
      map.setFilter(layer.id, existing ? ["all", existing, withinLt] : withinLt);
    });

    send({ type: "ready" });
  });

  var letters = [];
  var placeMode = false;
  var pickMarker = null;
  // Markers are persistent DOM elements: cards are built once per data
  // load, hotspots once per (integer) zoom level, and render() only swaps
  // which set is attached. Panning never rebuilds anything.
  var cardMarkers = [];
  var hotspotMarkers = [];
  var markerMode = null;        // "cards" | "hot"
  var hotspotZoomBuilt = null;  // integer zoom the hotspot set was clustered for

  // Small deterministic per-letter variation: display jitter (so two letters
  // left at the same bench don't stack perfectly), rotation, animation delay.
  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return Math.abs(h);
  }

  function prepared(l) {
    var h = hash(l.id);
    return {
      id: l.id,
      own: l.own,
      likes: l.likes,
      body: l.body,
      nick: l.nick,
      lat: l.lat + (((h % 100) / 100) - 0.5) * 0.00012,
      lng: l.lng + ((((h >> 7) % 100) / 100) - 0.5) * 0.0002,
      rot: ((((h >> 3) % 9) - 4) * 0.8),
      delay: ((h >> 5) % 20) / 10,
    };
  }

  function heartBurst(clientX, clientY) {
    var el = document.createElement("div");
    el.className = "burst";
    el.textContent = "\\u2665";
    el.style.left = clientX + "px";
    el.style.top = clientY + "px";
    document.getElementById("map").appendChild(el);
    setTimeout(function () { el.remove(); }, 950);
  }

  function detach(markers) {
    markers.forEach(function (m) { m.remove(); });
  }

  function attach(markers) {
    markers.forEach(function (m) { m.addTo(map); });
  }

  // MapLibre positions the marker element itself with an inline transform,
  // and the card/hotspot/pin animations animate transform too — so every
  // animated element needs a plain wrapper to be the actual marker.
  function wrapped(el) {
    var wrap = document.createElement("div");
    wrap.appendChild(el);
    return wrap;
  }

  function buildCards() {
    detach(cardMarkers);
    cardMarkers = letters.map(function (l) {
      var isLong = l.body.length > SHORT_MAX;
      var openable = l.own || isLong;
      var el = document.createElement("div");
      el.className = "card" + (l.own ? " own" : "") + (l.likes >= LOVED_LIKES ? " loved" : "");
      el.style.setProperty("--rot", l.rot + "deg");
      el.style.setProperty("--delay", l.delay + "s");
      el.innerHTML =
        '<div class="ctext' + (isLong ? " clamp" : "") + '">' + esc(l.body) + "</div>" +
        (isLong ? '<div class="cmore">skaityti toliau\\u2026</div>' : "") +
        '<div class="cfoot">' +
          '<span class="csig">\\u2014 ' + esc(l.nick) + "</span>" +
          (l.likes > 0 ? '<span class="clikes">\\u2665 ' + l.likes + "</span>" : "") +
        "</div>";
      var lastTap = 0;
      var singleTapTimer = null;
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        if (placeMode) return;
        if (openable) {
          send({ type: "letterTap", id: l.id });
          return;
        }
        // Short letters are fully readable in place, so a single tap has
        // nothing to "open" for reading — instead it goes straight to the
        // contact prompt. A second tap within the window cancels that and
        // likes instead, so the double-tap-to-like gesture still works.
        var now = Date.now();
        if (now - lastTap < DOUBLE_TAP_MS) {
          lastTap = 0;
          if (singleTapTimer) { clearTimeout(singleTapTimer); singleTapTimer = null; }
          heartBurst(e.clientX, e.clientY);
          send({ type: "likeTap", id: l.id });
        } else {
          lastTap = now;
          var tapId = l.id;
          singleTapTimer = setTimeout(function () {
            singleTapTimer = null;
            send({ type: "letterTap", id: tapId, openRequest: true });
          }, DOUBLE_TAP_MS);
        }
      });
      return new maplibregl.Marker({ element: wrapped(el), anchor: "center" })
        .setLngLat([l.lng, l.lat]);
    });
  }

  // Web-mercator world pixel at a given zoom — clustering must be stable
  // for a zoom level regardless of where the map is currently centered.
  function worldPx(lat, lng, zoom) {
    var scale = 512 * Math.pow(2, zoom);
    var x = ((lng + 180) / 360) * scale;
    var s = Math.sin((lat * Math.PI) / 180);
    var y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
    return { x: x, y: y };
  }

  function buildHotspots(zoom) {
    detach(hotspotMarkers);
    var cells = {};
    letters.forEach(function (l) {
      var p = worldPx(l.lat, l.lng, zoom);
      var key = Math.floor(p.x / CLUSTER_CELL_PX) + ":" + Math.floor(p.y / CLUSTER_CELL_PX);
      (cells[key] = cells[key] || []).push(l);
    });
    hotspotMarkers = Object.keys(cells).map(function (key) {
      var members = cells[key];
      var lat = 0, lng = 0;
      members.forEach(function (l) { lat += l.lat; lng += l.lng; });
      lat /= members.length; lng /= members.length;
      var size = Math.min(64, 30 + Math.round(Math.sqrt(members.length) * 7));
      var el = document.createElement("div");
      el.className = "hot";
      el.style.width = size + "px";
      el.style.height = size + "px";
      el.style.fontSize = (members.length > 99 ? 12 : 14) + "px";
      el.textContent = String(members.length);
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        if (placeMode) return;
        var mb = new maplibregl.LngLatBounds();
        members.forEach(function (l) { mb.extend([l.lng, l.lat]); });
        map.fitBounds(mb, { padding: 60, maxZoom: CARD_ZOOM + 1, duration: 600 });
      });
      return new maplibregl.Marker({ element: wrapped(el), anchor: "center" })
        .setLngLat([lng, lat]);
    });
  }

  function render() {
    // No rebuilds mid one-finger-zoom-drag; one render fires on release.
    if (ofz) return;
    var z = map.getZoom();
    if (z >= CARD_ZOOM) {
      if (markerMode !== "cards") {
        detach(hotspotMarkers);
        attach(cardMarkers);
        markerMode = "cards";
      }
    } else {
      var zi = Math.round(z);
      if (hotspotZoomBuilt !== zi) {
        buildHotspots(zi);
        hotspotZoomBuilt = zi;
        if (markerMode === "hot") attach(hotspotMarkers);
      }
      if (markerMode !== "hot") {
        detach(cardMarkers);
        attach(hotspotMarkers);
        markerMode = "hot";
      }
    }
  }

  // Panning never rebuilds anything — only zoom changes matter.
  map.on("zoomend", render);

  map.on("click", function (e) {
    if (!placeMode) return;
    // Clamp to the same box the DB CHECK enforces.
    var lat = Math.min(${b.north}, Math.max(${b.south}, e.lngLat.lat));
    var lng = Math.min(${b.east}, Math.max(${b.west}, e.lngLat.lng));
    if (pickMarker) pickMarker.remove();
    var el = document.createElement("div");
    el.className = "pick";
    el.innerHTML = "<span>\\u2709</span>";
    pickMarker = new maplibregl.Marker({ element: wrapped(el), anchor: "bottom" })
      .setLngLat([lng, lat])
      .addTo(map);
    send({ type: "placePick", lat: lat, lng: lng });
  });

  // One-finger zoom (Google/Apple Maps style): tap, then tap again and
  // hold — dragging down zooms in, up zooms out, anchored on the tapped
  // spot. Map background only: a second tap landing on a letter or
  // hotspot belongs to the like / open interactions, never to zoom.
  var OFZ_PX_PER_LEVEL = 130;   // drag distance per zoom level, tuning knob
  var OFZ_TAP_MS = 300;         // max gap between the two taps
  var OFZ_TAP_SLOP = 50;        // max px between the two taps
  var container = map.getContainer();
  var firstTap = null;          // {time, x, y} of a completed quick tap
  var touchStart = null;        // {time, x, y} of the touch in flight
  var ofz = null;               // active zoom drag: {startY, startZoom, anchor}

  function onMarkerEl(target) {
    return target && target.closest && target.closest(".card, .hot");
  }

  function endOneFingerZoom() {
    if (ofz) {
      ofz = null;
      map.dragPan.enable();
      render();
    }
  }

  container.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) { endOneFingerZoom(); touchStart = null; return; }
    var t = e.touches[0];
    touchStart = { time: Date.now(), x: t.clientX, y: t.clientY };
    if (
      !onMarkerEl(t.target) &&
      firstTap &&
      touchStart.time - firstTap.time < OFZ_TAP_MS &&
      Math.abs(t.clientX - firstTap.x) < OFZ_TAP_SLOP &&
      Math.abs(t.clientY - firstTap.y) < OFZ_TAP_SLOP
    ) {
      ofz = {
        startY: t.clientY,
        startZoom: map.getZoom(),
        anchor: map.unproject([t.clientX, t.clientY]),
      };
      map.dragPan.disable();
    }
  }, { passive: true });

  container.addEventListener("touchmove", function (e) {
    if (!ofz || e.touches.length !== 1) return;
    e.preventDefault();
    var dy = e.touches[0].clientY - ofz.startY;
    var z = Math.max(map.getMinZoom(),
            Math.min(map.getMaxZoom(), ofz.startZoom + dy / OFZ_PX_PER_LEVEL));
    map.easeTo({ zoom: z, around: ofz.anchor, duration: 0 });
  }, { passive: false });

  container.addEventListener("touchend", function (e) {
    var wasZooming = ofz !== null;
    endOneFingerZoom();
    // Record a completed quick tap on the bare map as a candidate first
    // tap of the gesture; anything else (a drag, a long press, a tap on a
    // marker, the zoom drag itself) resets the sequence.
    var t = e.changedTouches[0];
    if (
      !wasZooming && t && touchStart && e.touches.length === 0 &&
      !onMarkerEl(t.target) &&
      Date.now() - touchStart.time < 250 &&
      Math.abs(t.clientX - touchStart.x) < 20 &&
      Math.abs(t.clientY - touchStart.y) < 20
    ) {
      firstTap = { time: Date.now(), x: t.clientX, y: t.clientY };
    } else {
      firstTap = null;
    }
    touchStart = null;
  }, { passive: true });

  container.addEventListener("touchcancel", function () {
    endOneFingerZoom();
    firstTap = null;
    touchStart = null;
  }, { passive: true });

  window.setLetters = function (next) {
    letters = next.map(prepared);
    var wasCards = markerMode === "cards";
    detach(cardMarkers);
    buildCards();
    if (wasCards) attach(cardMarkers);
    hotspotZoomBuilt = null; // stale clustering — render() rebuilds if needed
    render();
  };

  window.setPlaceMode = function (on) {
    placeMode = on;
    if (!on && pickMarker) { pickMarker.remove(); pickMarker = null; }
  };

  // Local place search (lib/place-search.ts) resolves a typed name to a
  // lat/lng on the RN side; this just does the camera move.
  window.flyTo = function (lat, lng) {
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), CARD_ZOOM), duration: 900 });
  };
</script>
</body>
</html>`;
}
