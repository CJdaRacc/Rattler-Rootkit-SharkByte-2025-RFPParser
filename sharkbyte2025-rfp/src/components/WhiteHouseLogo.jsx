import React from 'react';

// Simple outline of the White House (stylized). Stroke-only SVG for easy theming.
export default function WhiteHouseLogo({ className = 'h-6 w-6', stroke = 'currentColor' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Base platform */}
        <path d="M8 50h48"/>
        {/* Columns */}
        <path d="M14 50V30M22 50V30M32 50V30M42 50V30M50 50V30"/>
        {/* Roof */}
        <path d="M8 30h48"/>
        <path d="M10 30l22-12 22 12"/>
        {/* Door */}
        <rect x="30" y="38" width="4" height="12"/>
        {/* Windows */}
        <rect x="16" y="36" width="4" height="6"/>
        <rect x="24" y="36" width="4" height="6"/>
        <rect x="36" y="36" width="4" height="6"/>
        <rect x="44" y="36" width="4" height="6"/>
        {/* Flag pole and flag */}
        <path d="M32 18v-6"/>
        <path d="M32 12l6 2-6 2"/>
      </g>
    </svg>
  );
}
