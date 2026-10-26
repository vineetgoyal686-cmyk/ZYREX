import { useId } from "react";
import "@fontsource/poppins/700.css";

/*
 * ZyAI brand: a hawk drawn from sharp wing blades (sky blue → royal blue →
 * violet) and the "ZyAI" wordmark — "Zy" in heavy Poppins, "AI" in the blue
 * gradient. `tone` picks the "Zy" colour for dark or light backgrounds.
 */
// `color` draws the hawk in one solid colour (e.g. white on a blue block)
export function ZyHawkIcon({ size = 24, className = "", color }) {
  const g = useId();
  const fill = color || `url(#${g})`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={g} gradientUnits="userSpaceOnUse" x1="44" y1="2" x2="10" y2="46">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="0.55" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      {/* big wing sweeping up to the right */}
      <path d="M9 25 C17 14 29 6 45 2 C37 9 30 15 25 23 Z" fill={fill} />
      {/* head and body, beak to the left */}
      <path d="M3 21 C10 21.5 15 25 18 31 L27 21.5 C25 32 21 40 14 46.5 C14.5 38 11 29 3 21 Z" fill={fill} />
      {/* inner feather */}
      <path d="M21 28 C25 23 31 19.5 38 18.5 C32.5 21.5 28.5 25.5 25.5 31 Z" fill={fill} opacity="0.85" />
    </svg>
  );
}

// A tiny four-point star; position it with className (it's absolutely placed)
export function ZyStar({ className = "", size = 7 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" className={`pointer-events-none absolute ${className}`} aria-hidden="true">
      <path d="M5 0 Q5.6 4.4 10 5 Q5.6 5.6 5 10 Q4.4 5.6 0 5 Q4.4 4.4 5 0Z" fill="#e0f2fe" />
    </svg>
  );
}

// `vivid` paints "AI" in the hawk's full sky → blue → violet gradient
export function ZyAIWordmark({ size = 20, tone = "dark", vivid = false }) {
  return (
    <span className="inline-flex items-baseline font-bold leading-none tracking-[-0.02em]"
      style={{ fontFamily: "'Poppins', system-ui, sans-serif", fontSize: size }}>
      <span className={tone === "dark" ? "text-white" : "text-[#0b2540]"}>Zy</span>
      <span className={`${vivid ? "bg-gradient-to-r from-[#38bdf8] via-[#3b82f6] to-[#8b5cf6]" : "bg-gradient-to-b from-[#60a5fa] to-[#2563eb]"} bg-clip-text text-transparent`}>AI</span>
    </span>
  );
}
