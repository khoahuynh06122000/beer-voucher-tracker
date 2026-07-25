import React from "react";

interface DraftBeerGlassProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showGlow?: boolean;
}

export const DraftBeerGlass: React.FC<DraftBeerGlassProps> = ({
  className = "",
  size = "md",
  showGlow = true,
}) => {
  const sizeClasses = {
    sm: "w-20 h-28",
    md: "w-36 h-48",
    lg: "w-52 h-68",
    xl: "w-64 h-80",
  }[size];

  return (
    <div className={`relative flex items-center justify-center select-none ${sizeClasses} ${className}`}>
      {/* Ambient background glow behind glass */}
      {showGlow && (
        <div className="absolute inset-0 bg-gradient-to-t from-amber-600/40 via-amber-400/30 to-yellow-300/20 blur-2xl rounded-full animate-pulse" />
      )}

      <svg
        viewBox="0 0 200 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_15px_25px_rgba(245,158,11,0.35)] relative z-10"
      >
        <defs>
          {/* Beer Liquid Gradient */}
          <linearGradient id="beerLiquid" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="45%" stopColor="#F59E0B" />
            <stop offset="85%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>

          {/* Glass Highlight */}
          <linearGradient id="glassReflection" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0.45" />
            <stop offset="20%" stopColor="white" stopOpacity="0.1" />
            <stop offset="80%" stopColor="white" stopOpacity="0.05" />
            <stop offset="100%" stopColor="white" stopOpacity="0.3" />
          </linearGradient>

          {/* Foam Head Gradient */}
          <linearGradient id="foamHead" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="70%" stopColor="#FEF3C7" />
            <stop offset="100%" stopColor="#FDE68A" />
          </linearGradient>

          {/* Handle Gradient */}
          <linearGradient id="handleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.1)" />
          </linearGradient>

          {/* Shadow Filter */}
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Beer Mug Handle */}
        <path
          d="M 145 75 C 185 75, 190 185, 145 195 C 135 195, 135 175, 145 170 C 170 162, 168 98, 145 92 Z"
          fill="url(#handleGrad)"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="2"
        />

        {/* Outer Glass Contour */}
        <path
          d="M 45 45 L 52 235 C 53 248, 65 255, 100 255 C 135 255, 147 248, 148 235 L 155 45 Z"
          fill="rgba(255, 255, 255, 0.08)"
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth="3"
        />

        {/* Thick Glass Bottom Base */}
        <path
          d="M 51 228 C 51 245, 62 255, 100 255 C 138 255, 149 245, 149 228 L 150 215 C 135 220, 65 220, 50 215 Z"
          fill="rgba(255, 255, 255, 0.25)"
          stroke="rgba(255, 255, 255, 0.5)"
          strokeWidth="1.5"
        />

        {/* Amber Beer Liquid Fill */}
        <path
          d="M 48 70 L 52 225 C 55 240, 70 246, 100 246 C 130 246, 145 240, 148 225 L 152 70 Z"
          fill="url(#beerLiquid)"
        />

        {/* Vertical Glass Flutes / Ribs for classic beer mug look */}
        <path d="M 70 70 L 72 225" stroke="rgba(255,255,255,0.18)" strokeWidth="3" strokeLinecap="round" />
        <path d="M 100 70 L 100 228" stroke="rgba(255,255,255,0.22)" strokeWidth="4" strokeLinecap="round" />
        <path d="M 130 70 L 128 225" stroke="rgba(255,255,255,0.18)" strokeWidth="3" strokeLinecap="round" />

        {/* Rising Carbonation Bubbles in Liquid */}
        <g opacity="0.85">
          <circle cx="80" cy="180" r="2.5" fill="#FFF" className="animate-bounce" style={{ animationDuration: '1.8s' }} />
          <circle cx="115" cy="195" r="3" fill="#FFF" className="animate-bounce" style={{ animationDuration: '2.2s' }} />
          <circle cx="95" cy="140" r="2" fill="#FFF" className="animate-bounce" style={{ animationDuration: '1.5s' }} />
          <circle cx="125" cy="130" r="3.5" fill="#FFF" className="animate-bounce" style={{ animationDuration: '2.5s' }} />
          <circle cx="70" cy="110" r="2" fill="#FFF" className="animate-bounce" style={{ animationDuration: '1.9s' }} />
          <circle cx="105" cy="90" r="2.5" fill="#FFF" className="animate-bounce" style={{ animationDuration: '1.4s' }} />
          <circle cx="135" cy="160" r="2" fill="#FFF" className="animate-bounce" style={{ animationDuration: '2.1s' }} />
        </g>

        {/* Rich White Creamy Foam Head */}
        <g filter="url(#softGlow)">
          {/* Main Foam Body */}
          <path
            d="M 40 50 C 35 40, 50 25, 65 30 C 75 18, 95 18, 105 28 C 118 15, 140 20, 148 32 C 160 30, 168 45, 160 55 C 158 65, 145 68, 135 65 C 120 72, 80 72, 65 65 C 50 68, 42 60, 40 50 Z"
            fill="url(#foamHead)"
          />
          {/* Foam Fluff Overhangs */}
          <circle cx="55" cy="48" r="14" fill="#FFFFFF" />
          <circle cx="80" cy="38" r="18" fill="#FFFFFF" />
          <circle cx="108" cy="36" r="19" fill="#FFFFFF" />
          <circle cx="138" cy="44" r="16" fill="#FEF3C7" />
          <circle cx="152" cy="52" r="11" fill="#FDE68A" />

          {/* Dribbling Foam Drips */}
          <path d="M 48 55 C 48 65, 52 75, 50 82 C 48 85, 44 85, 44 80 C 44 72, 46 62, 46 55 Z" fill="#FFFFFF" />
          <path d="M 148 55 C 148 68, 145 78, 147 84 C 149 87, 152 85, 152 78 C 151 70, 150 60, 150 55 Z" fill="#FEF3C7" />
        </g>

        {/* Glass Front Gloss & Light Reflection */}
        <path
          d="M 52 70 L 56 220 C 56 220, 68 225, 75 220 L 70 70 Z"
          fill="url(#glassReflection)"
        />

        {/* Cold Condensation Water Droplets on Outside Glass */}
        <g fill="rgba(255,255,255,0.7)">
          <ellipse cx="62" cy="115" rx="1.5" ry="2.5" />
          <ellipse cx="65" cy="155" rx="2" ry="3.5" />
          <ellipse cx="60" cy="190" rx="1.5" ry="2" />
          <ellipse cx="140" cy="125" rx="2" ry="3" />
          <ellipse cx="138" cy="175" rx="1.5" ry="2.5" />
          <ellipse cx="110" cy="205" rx="2" ry="3" />
        </g>

        {/* Cold Frost Shimmer Badge */}
        <g transform="translate(82, 120) scale(0.7)">
          <circle cx="25" cy="25" r="22" fill="rgba(0,0,0,0.25)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
          <path d="M 25 10 L 25 40 M 10 25 L 40 25 M 14 14 L 36 36 M 14 36 L 36 14" stroke="#FFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
        </g>
      </svg>
    </div>
  );
};
