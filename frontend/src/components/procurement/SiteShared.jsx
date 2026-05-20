import React, { useEffect, useRef, useState } from "react";
import { MapPin, X, Search, ChevronDown } from "lucide-react";

/* ── Leaflet singleton loader ── */
let _leafletPromise = null;
export const loadLeaflet = () => {
  if (_leafletPromise) return _leafletPromise;
  _leafletPromise = new Promise((resolve) => {
    if (window.L) return resolve();
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => {
      const L = window.L;
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      resolve();
    };
    document.head.appendChild(s);
  });
  return _leafletPromise;
};

/* ── Map Modal ── */
export function SiteMapModal({ initialLat, initialLng, onSave, onClose, zClassName = "z-[80]" }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [coords, setCoords] = useState({ lat: initialLat ? +initialLat : 28.6139, lng: initialLng ? +initialLng : 77.2090 });
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [gettingLoc, setGettingLoc] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadLeaflet();
      if (!mounted || !mapContainerRef.current) return;
      const L = window.L;
      const map = L.map(mapContainerRef.current, { zoomControl: false, attributionControl: false })
        .setView([coords.lat, coords.lng], 13);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      const marker = L.marker([coords.lat, coords.lng], { draggable: true }).addTo(map);
      const update = (lat, lng) => {
        if (mounted) setCoords({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) });
      };
      marker.on("dragend", (e) => { const p = e.target.getLatLng(); update(p.lat, p.lng); });
      map.on("click", (e) => { marker.setLatLng(e.latlng); update(e.latlng.lat, e.latlng.lng); });
      mapInstanceRef.current = map;
      markerRef.current = marker;
      if (mounted) setMapReady(true);
    })();
    return () => {
      mounted = false;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveTo = (lat, lng) => {
    const la = +lat, lo = +lng;
    setCoords({ lat: +la.toFixed(6), lng: +lo.toFixed(6) });
    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.setView([la, lo], 15);
      markerRef.current.setLatLng([la, lo]);
    }
  };

  const handleSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQ)}&limit=1`);
      const data = await res.json();
      if (data[0]) moveTo(+data[0].lat, +data[0].lon);
    } catch { }
    setSearching(false);
  };

  const handleMyLocation = () => {
    if (!navigator.geolocation) return;
    setGettingLoc(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { moveTo(p.coords.latitude, p.coords.longitude); setGettingLoc(false); },
      () => setGettingLoc(false),
      { timeout: 10000 }
    );
  };

  return (
    <div className={`fixed inset-0 ${zClassName} flex items-center justify-center bg-black/40 p-4`} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-slate-700 shrink-0" />
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">Select Location from Map</p>
              <p className="text-xs text-slate-400 mt-0.5">Search for a location or click directly on the map.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors -mt-0.5">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-3 flex gap-2 items-center">
          <div className="flex-1 relative">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search location..."
              className="w-full border border-slate-200 rounded-full px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 pr-8 text-slate-700 bg-white shadow-sm"
            />
            {searchQ && (
              <button onClick={() => setSearchQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>
          <button
            onClick={handleMyLocation}
            disabled={gettingLoc}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-full text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 whitespace-nowrap shadow-sm"
          >
            <MapPin size={14} />
            {gettingLoc ? "Locating…" : "Use My Location"}
          </button>
        </div>

        <div className="px-5 pb-2 relative">
          <div
            ref={mapContainerRef}
            style={{ height: 320 }}
            className="w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm"
          />
          {!mapReady && (
            <div className="absolute inset-x-5 rounded-xl bg-slate-100 flex items-center justify-center pointer-events-none" style={{ height: 320, top: 0 }}>
              <span className="text-sm text-slate-400">{searching ? "Searching…" : "Loading map…"}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-2 flex gap-5 text-xs font-mono text-slate-500">
          <span>Lat: <b className="text-slate-700">{coords.lat}</b></span>
          <span>Lng: <b className="text-slate-700">{coords.lng}</b></span>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-full text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => onSave(String(coords.lat), String(coords.lng))}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-full text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <MapPin size={14} /> Save Location
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Form Field ── */
export const SiteFormField = ({ label, value, onChange, placeholder, textarea, required, select, options = [], rows = 4 }) => (
  <div className="flex flex-col">
    {label && (
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
    )}
    {textarea ? (
      <textarea value={value} onChange={onChange} rows={rows} placeholder={placeholder}
        className="flex-1 w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-50 text-slate-700 resize-none transition-colors" />
    ) : select ? (
      <div className="relative">
        <select value={value} onChange={onChange}
          className="w-full border border-slate-200 rounded-md px-3 py-2.5 pr-8 text-sm outline-none focus:border-indigo-400 text-slate-700 bg-white transition-colors appearance-none">
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    ) : (
      <input value={value} onChange={onChange} placeholder={placeholder}
        className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-50 text-slate-700 transition-colors" />
    )}
  </div>
);

/* ── Contact Picker ── */
export function SiteContactPicker({ allContacts, contact, onSelect, onClear, isPrimary }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef(null);

  const matches = allContacts.filter(c =>
    !query ||
    c.personName?.toLowerCase().includes(query.toLowerCase()) ||
    c.contactNumber?.toLowerCase().includes(query.toLowerCase()) ||
    c.email?.toLowerCase().includes(query.toLowerCase())
  );

  const handleBlur = () => {
    blurTimer.current = setTimeout(() => setOpen(false), 150);
  };

  const handlePick = (c) => {
    clearTimeout(blurTimer.current);
    onSelect(c);
    setQuery("");
    setOpen(false);
  };

  if (contact.name) {
    return (
      <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-slate-200 shadow-sm">
        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
          <span className="text-indigo-700 text-sm font-bold">{contact.name?.[0]?.toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 leading-tight">{contact.name}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            {contact.phone}{contact.email ? ` • ${contact.email}` : ""}
          </p>
        </div>
        <button type="button" onClick={onClear}
          className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 shrink-0 transition-colors">
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 border border-slate-200 rounded-md px-3 py-2.5 bg-white focus-within:border-indigo-400 transition-colors">
        <Search size={14} className="text-slate-400 shrink-0" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          placeholder={isPrimary ? "Search and select primary contact…" : "Search and select contact…"}
          className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400 bg-transparent"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600">
            <X size={12} />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-40 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-400 text-center">No contacts found</p>
          ) : matches.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => handlePick(c)}
              className="w-full px-4 py-3 text-left hover:bg-indigo-50 flex items-center gap-3 border-b border-slate-100 last:border-0 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <span className="text-indigo-700 text-xs font-bold">{c.personName?.[0]?.toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 leading-tight">{c.personName}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {c.contactNumber}{c.email ? ` • ${c.email}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

