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
    sm: "w-32 h-44",
    md: "w-56 h-72",
    lg: "w-80 h-[420px]",
    xl: "w-96 h-[500px]",
  }[size];

  return (
    <div className={`relative flex items-center justify-center select-none ${sizeClasses} ${className}`}>
      {/* Ambient warm golden glow behind glass */}
      {showGlow && (
        <div className="absolute inset-0 bg-gradient-to-t from-amber-600/50 via-amber-400/40 to-yellow-200/30 blur-2xl rounded-full animate-pulse" />
      )}

      <svg
        viewBox="0 0 220 290"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_20px_30px_rgba(217,119,6,0.45)] relative z-10"
      >
        <defs>
          {/* Beer Liquid Gradient - Rich Amber Gold */}
          <linearGradient id="beerLiquidGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="30%" stopColor="#F59E0B" />
            <stop offset="70%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#92400E" />
          </linearGradient>

          {/* Glass Rim & High-Gloss Highlight */}
          <linearGradient id="glassGloss" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
            <stop offset="25%" stopColor="#FFFFFF" stopOpacity="0.15" />
            <stop offset="75%" stopColor="#FFFFFF" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.5" />
          </linearGradient>

          {/* Foam Cream Head Gradient */}
          <linearGradient id="foamGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="70%" stopColor="#FEF3C7" />
            <stop offset="100%" stopColor="#FDE68A" />
          </linearGradient>

          {/* Handle Glass Gradient */}
          <linearGradient id="glassHandle" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.15)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.35)" />
          </linearGradient>

          {/* Dark Badge Backdrop Gradient for Maximum Text Contrast */}
          <radialGradient id="badgeBackdrop" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1E1B18" stopOpacity="0.88" />
            <stop offset="75%" stopColor="#0F172A" stopOpacity="0.82" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.6" />
          </radialGradient>

          {/* Gold Banner Gradient */}
          <linearGradient id="goldBanner" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="50%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>

          {/* Soft Glow Filter */}
          <filter id="foamGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Drop Shadow Filter for Text */}
          <filter id="textShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* --- 1. GLASS MUG HANDLE --- */}
        <path
          d="M 155 78 C 205 78, 212 192, 155 202 C 142 202, 142 180, 155 174 C 185 166, 183 102, 155 96 Z"
          fill="url(#glassHandle)"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="2.5"
        />

        {/* --- 2. GLASS MUG BODY CONTOUR --- */}
        <path
          d="M 45 48 L 53 240 C 54 256, 68 265, 110 265 C 152 265, 166 256, 167 240 L 175 48 Z"
          fill="rgba(255, 255, 255, 0.1)"
          stroke="rgba(255, 255, 255, 0.5)"
          strokeWidth="3.5"
        />

        {/* --- 3. HEAVY GLASS BASE / BOTTOM --- */}
        <path
          d="M 52 232 C 52 252, 65 264, 110 264 C 155 264, 168 252, 168 232 L 169 218 C 152 224, 68 224, 51 218 Z"
          fill="rgba(255, 255, 255, 0.28)"
          stroke="rgba(255, 255, 255, 0.6)"
          strokeWidth="2"
        />

        {/* --- 4. BEER LIQUID FILL --- */}
        <path
          d="M 48 72 L 53 230 C 56 248, 72 254, 110 254 C 148 254, 164 248, 167 230 L 172 72 Z"
          fill="url(#beerLiquidGrad)"
        />

        {/* --- 5. VERTICAL GLASS FLUTES / REFLECTIONS --- */}
        <path d="M 72 72 L 75 230" stroke="rgba(255,255,255,0.22)" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M 110 72 L 110 234" stroke="rgba(255,255,255,0.28)" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M 148 72 L 145 230" stroke="rgba(255,255,255,0.22)" strokeWidth="3.5" strokeLinecap="round" />

        {/* --- 6. CARBONATION BUBBLES --- */}
        <g opacity="0.9">
          <circle cx="85" cy="190" r="2.5" fill="#FFF" className="animate-bounce" style={{ animationDuration: '1.7s' }} />
          <circle cx="125" cy="205" r="3" fill="#FFF" className="animate-bounce" style={{ animationDuration: '2.1s' }} />
          <circle cx="102" cy="150" r="2" fill="#FFF" className="animate-bounce" style={{ animationDuration: '1.4s' }} />
          <circle cx="138" cy="138" r="3.5" fill="#FFF" className="animate-bounce" style={{ animationDuration: '2.4s' }} />
          <circle cx="75" cy="115" r="2" fill="#FFF" className="animate-bounce" style={{ animationDuration: '1.8s' }} />
          <circle cx="115" cy="95" r="2.5" fill="#FFF" className="animate-bounce" style={{ animationDuration: '1.3s' }} />
          <circle cx="150" cy="170" r="2" fill="#FFF" className="animate-bounce" style={{ animationDuration: '2.0s' }} />
        </g>

        {/* --- 7. RICH OVERFLOWING WHITE FOAM HEAD --- */}
        <g filter="url(#foamGlow)">
          <path
            d="M 38 52 C 32 40, 48 24, 65 28 C 76 15, 98 15, 110 26 C 124 12, 148 18, 158 30 C 172 28, 180 44, 172 55 C 168 66, 154 70, 142 66 C 126 74, 84 74, 68 66 C 52 70, 42 62, 38 52 Z"
            fill="url(#foamGrad)"
          />
          <circle cx="56" cy="48" r="16" fill="#FFFFFF" />
          <circle cx="84" cy="38" r="20" fill="#FFFFFF" />
          <circle cx="116" cy="35" r="22" fill="#FFFFFF" />
          <circle cx="148" cy="44" r="18" fill="#FEF3C7" />
          <circle cx="165" cy="52" r="13" fill="#FDE68A" />

          {/* Dribbling Foam Drips on Glass */}
          <path d="M 46 56 C 46 68, 50 78, 48 86 C 46 90, 42 88, 42 82 C 42 73, 44 63, 44 56 Z" fill="#FFFFFF" />
          <path d="M 162 56 C 162 70, 158 82, 160 90 C 162 93, 166 91, 165 82 C 164 74, 163 62, 163 56 Z" fill="#FEF3C7" />
        </g>

        {/* --- 8. GLASS FRONT GLOSS REFLECTION --- */}
        <path
          d="M 52 72 L 57 225 C 57 225, 70 230, 78 225 L 72 72 Z"
          fill="url(#glassGloss)"
        />

        {/* --- 9. CONDENSATION DROPLETS --- */}
        <g fill="rgba(255,255,255,0.75)">
          <ellipse cx="66" cy="120" rx="2" ry="3.5" />
          <ellipse cx="70" cy="165" rx="2.5" ry="4" />
          <ellipse cx="64" cy="200" rx="2" ry="3" />
          <ellipse cx="152" cy="130" rx="2.5" ry="4" />
          <ellipse cx="148" cy="185" rx="2" ry="3.5" />
          <ellipse cx="120" cy="215" rx="2.5" ry="4" />
        </g>

        {/* --- 10. HIGH-CONTRAST LOGO EMBLEM ON GLASS --- */}
        <g transform="translate(110, 150) scale(1.3)">
          {/* Dark Contrast Circle Shield Background */}
          <circle
            cx="0"
            cy="0"
            r="44"
            fill="url(#badgeBackdrop)"
            stroke="#F59E0B"
            strokeWidth="2.2"
            className="drop-shadow-[0_8px_20px_rgba(0,0,0,0.9)]"
          />

          {/* Decorative Dashed Outer Gold Ring */}
          <circle
            cx="0"
            cy="0"
            r="40"
            fill="none"
            stroke="#FBBF24"
            strokeWidth="1.2"
            strokeDasharray="4 2"
            opacity="0.85"
          />

          {/* Top Arc Path & Text: ★ PROUDLY BREWED ★ */}
          <path id="archTextPath" d="M -32,-11 A 33,33 0 0,1 32,-11" fill="none" />
          <text fontSize="5.2" fontWeight="900" fill="#FDE047" textAnchor="middle" letterSpacing="0.8">
            <textPath href="#archTextPath" startOffset="50%">★ PROUDLY BREWED ★</textPath>
          </text>

          {/* Center Beer Mug & Palm Trees Icon */}
          <g transform="translate(0, -25) scale(0.48)">
            {/* Beer Mug with Foam */}
            <path d="M -8,-2 L -8,10 C -8,13 -5,15 0,15 C 5,15 8,13 8,10 L 8,-2 Z" fill="#F59E0B" stroke="#FFF" strokeWidth="1.2" />
            <path d="M 8,0 C 13,0 13,8 8,8" fill="none" stroke="#FFF" strokeWidth="2" />
            <path d="M -10,-2 C -10,-7 -5,-8 0,-8 C 5,-8 10,-7 10,-2 Z" fill="#FFFFFF" />
            {/* Palm Trees */}
            <path d="M -16,6 C -12,-2 -18,-8 -20,-4 M -16,6 C -10,0 -12,-10 -15,-6" stroke="#FBBF24" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M 16,6 C 12,-2 18,-8 20,-4 M 16,6 C 10,0 12,-10 15,-6" stroke="#FBBF24" strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>

          {/* Text Line 1: SUN */}
          <text
            x="0"
            y="-3"
            fill="#FFFFFF"
            fontSize="16"
            fontWeight="900"
            fontFamily="Impact, 'Arial Black', sans-serif"
            textAnchor="middle"
            letterSpacing="2"
            stroke="#78350F"
            strokeWidth="1"
            paintOrder="stroke fill"
          >
            SUN
          </text>

          {/* Text Line 2: KRAFTBEER */}
          <text
            x="0"
            y="9"
            fill="#FBBF24"
            fontSize="11"
            fontWeight="900"
            fontFamily="Impact, 'Arial Black', sans-serif"
            textAnchor="middle"
            letterSpacing="1"
            stroke="#451A03"
            strokeWidth="1"
            paintOrder="stroke fill"
          >
            KRAFTBEER
          </text>

          {/* Gold Curved Banner Ribbon */}
          <path
            d="M -34,15 Q 0,20 34,15 L 32,30 Q 0,35 -32,30 Z"
            fill="url(#goldBanner)"
            stroke="#FFFFFF"
            strokeWidth="1"
            className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
          />

          {/* Ribbon Text: BA NA HILLS SIGNATURE */}
          <text
            x="0"
            y="26"
            fill="#1E1B18"
            fontSize="5.2"
            fontWeight="900"
            fontFamily="'Arial Black', Arial, sans-serif"
            textAnchor="middle"
            letterSpacing="0.6"
            dominantBaseline="middle"
          >
            BA NA HILLS SIGNATURE
          </text>
        </g>
      </svg>
    </div>
  );
};

