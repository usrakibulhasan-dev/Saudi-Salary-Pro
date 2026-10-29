import React from 'react';

export const WelcomeBannerIllustration: React.FC<{ className?: string }> = ({
  className = 'w-64 h-36',
}) => {
  return (
    <svg
      viewBox="0 0 320 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="320" y2="180" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B5BDB" stopOpacity="0.25" />
          <stop offset="0.5" stopColor="#6658E8" stopOpacity="0.15" />
          <stop offset="1" stopColor="#13B8A6" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FFD166" />
          <stop offset="1" stopColor="#FF9F1C" />
        </linearGradient>
        <linearGradient id="tealGrad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#2EC4B6" />
          <stop offset="1" stopColor="#0E9F90" />
        </linearGradient>
        <linearGradient id="purpleGrad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#7209B7" />
          <stop offset="1" stopColor="#4361EE" />
        </linearGradient>
      </defs>

      {/* Background Soft Aura */}
      <rect width="320" height="180" rx="16" fill="url(#skyGrad)" />

      {/* Decorative Grid Lines */}
      <path
        d="M20 150 C80 140, 140 100, 200 115 C260 130, 290 85, 310 70"
        stroke="#13B8A6"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.6"
        strokeDasharray="4 4"
      />
      <path
        d="M10 160 C70 145, 130 90, 190 105 C250 120, 280 60, 310 40"
        stroke="url(#goldGrad)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Stylized Modern Architecture Silhouettes */}
      <path
        d="M230 180 L230 110 L250 85 L270 110 L270 180 Z"
        fill="#3B5BDB"
        fillOpacity="0.3"
      />
      <path
        d="M260 180 L260 95 L285 70 L300 95 L300 180 Z"
        fill="#6658E8"
        fillOpacity="0.25"
      />
      <rect x="200" y="125" width="24" height="55" rx="3" fill="#13B8A6" fillOpacity="0.35" />

      {/* Main Floating Salary Card Icon */}
      <g transform="translate(45, 30)">
        {/* Shadow */}
        <rect x="6" y="8" width="110" height="74" rx="12" fill="#0E172A" fillOpacity="0.25" />
        {/* Card Body */}
        <rect
          x="0"
          y="0"
          width="110"
          height="74"
          rx="12"
          fill="#FFFFFF"
          className="dark:fill-[#1E293B]"
          stroke="#E2E8F0"
          strokeWidth="1.5"
        />
        {/* Chip & Logo */}
        <rect x="12" y="14" width="20" height="14" rx="3" fill="url(#goldGrad)" />
        <circle cx="92" cy="20" r="7" fill="#3B5BDB" fillOpacity="0.8" />
        <circle cx="82" cy="20" r="7" fill="#13B8A6" fillOpacity="0.8" />
        {/* Card Lines */}
        <rect x="12" y="38" width="60" height="6" rx="3" fill="#94A3B8" fillOpacity="0.7" />
        <rect x="12" y="50" width="35" height="5" rx="2.5" fill="#CBD5E1" fillOpacity="0.8" />
        <text
          x="62"
          y="56"
          fill="#10B981"
          fontSize="9"
          fontWeight="bold"
          fontFamily="monospace"
        >
          +SAR
        </text>
      </g>

      {/* Floating Shield Coin */}
      <g transform="translate(145, 65)">
        <circle cx="22" cy="22" r="22" fill="url(#goldGrad)" />
        <circle cx="22" cy="22" r="18" fill="#FFFBEB" fillOpacity="0.3" />
        {/* Saudi Palm Stylized Center */}
        <path
          d="M22 10 L22 34 M17 16 C19 14, 25 14, 27 16 M15 22 C18 19, 26 19, 29 22"
          stroke="#78350F"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>

      {/* Verified Floating Badge */}
      <g transform="translate(195, 20)">
        <rect x="0" y="0" width="70" height="26" rx="13" fill="#10B981" />
        <circle cx="13" cy="13" r="7" fill="#FFFFFF" />
        <path d="M10 13 L12 15 L16 11" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <text x="26" y="17" fill="#FFFFFF" fontSize="10" fontWeight="bold">
          QIWA OK
        </text>
      </g>
    </svg>
  );
};

export interface EmptyIllustrationProps {
  type: 'attendance' | 'loans' | 'vacation' | 'documents' | 'finance' | 'backup' | 'search';
  className?: string;
}

export const EmptyStateIllustration: React.FC<EmptyIllustrationProps> = ({
  type,
  className = 'w-44 h-44',
}) => {
  switch (type) {
    case 'attendance':
      return (
        <svg viewBox="0 0 200 200" fill="none" className={className} aria-hidden="true">
          <circle cx="100" cy="100" r="80" fill="#E8FAF5" className="dark:fill-[#132B27]" />
          {/* Calendar Body */}
          <rect x="55" y="55" width="90" height="90" rx="16" fill="#FFFFFF" className="dark:fill-[#1E293B]" stroke="#13B8A6" strokeWidth="2.5" />
          <rect x="55" y="55" width="90" height="28" rx="16" fill="#13B8A6" />
          {/* Rings */}
          <rect x="75" y="45" width="8" height="16" rx="4" fill="#0D9488" />
          <rect x="117" y="45" width="8" height="16" rx="4" fill="#0D9488" />
          {/* Clock Circle */}
          <circle cx="120" cy="120" r="28" fill="#3B5BDB" />
          <path d="M120 106 L120 120 L130 125" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
          {/* Check badge */}
          <circle cx="80" cy="115" r="12" fill="#10B981" />
          <path d="M75 115 L78 118 L85 111" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'loans':
      return (
        <svg viewBox="0 0 200 200" fill="none" className={className} aria-hidden="true">
          <circle cx="100" cy="100" r="80" fill="#FFF1E8" className="dark:fill-[#2D201A]" />
          {/* Safe Box / Shield */}
          <path
            d="M100 45 L150 65 V110 C150 145 100 165 100 165 C100 165 50 145 50 110 V65 Z"
            fill="#FFFFFF"
            className="dark:fill-[#1E293B]"
            stroke="#FFB547"
            strokeWidth="3"
          />
          {/* Coin Stack */}
          <ellipse cx="100" cy="100" rx="28" ry="12" fill="#FFB547" />
          <ellipse cx="100" cy="110" rx="28" ry="12" fill="#FFA229" />
          <ellipse cx="100" cy="120" rx="28" ry="12" fill="#E68A00" />
          {/* Handshake Ribbon */}
          <path d="M85 85 L100 95 L115 85" stroke="#3B5BDB" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );

    case 'vacation':
      return (
        <svg viewBox="0 0 200 200" fill="none" className={className} aria-hidden="true">
          <circle cx="100" cy="100" r="80" fill="#EDF3FF" className="dark:fill-[#16223B]" />
          {/* Sun */}
          <circle cx="145" cy="65" r="24" fill="#FFB547" />
          {/* Beach Mound */}
          <path d="M30 160 C70 135 130 135 170 160 Z" fill="#FDE68A" />
          {/* Palm Trunk */}
          <path d="M70 160 Q80 110 95 80" stroke="#92400E" strokeWidth="6" strokeLinecap="round" />
          {/* Palm Fronds */}
          <path d="M95 80 Q70 65 50 80" stroke="#10B981" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M95 80 Q105 55 125 65" stroke="#10B981" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M95 80 Q120 85 135 105" stroke="#059669" strokeWidth="4.5" strokeLinecap="round" />
          {/* Luggage Case */}
          <rect x="110" y="120" width="40" height="32" rx="6" fill="#3B5BDB" />
          <rect x="122" y="112" width="16" height="8" rx="2" stroke="#FFFFFF" strokeWidth="2" />
        </svg>
      );

    case 'documents':
      return (
        <svg viewBox="0 0 200 200" fill="none" className={className} aria-hidden="true">
          <circle cx="100" cy="100" r="80" fill="#F1EDFF" className="dark:fill-[#211B35]" />
          {/* Back Folder Flap */}
          <path d="M45 80 C45 72 51 66 59 66 H85 L97 78 H141 C149 78 155 84 155 92 V140 C155 148 149 154 141 154 H59 C51 154 45 148 45 140 Z" fill="#B8A5FF" />
          {/* Paper Document Insert */}
          <rect x="60" y="55" width="80" height="75" rx="6" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2" />
          <line x1="72" y1="72" x2="110" y2="72" stroke="#6658E8" strokeWidth="3" strokeLinecap="round" />
          <line x1="72" y1="84" x2="128" y2="84" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="72" y1="96" x2="120" y2="96" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
          {/* Front Folder Lip */}
          <path d="M40 98 C40 92 45 86 52 86 H148 C155 86 160 92 160 98 V140 C160 148 154 154 146 154 H54 C46 154 40 148 40 140 Z" fill="#6658E8" />
          {/* Lock Emblem */}
          <circle cx="100" cy="120" r="14" fill="#FFFFFF" />
          <circle cx="100" cy="117" r="4" fill="#3B5BDB" />
          <rect x="98" y="117" width="4" height="6" fill="#3B5BDB" />
        </svg>
      );

    case 'finance':
      return (
        <svg viewBox="0 0 200 200" fill="none" className={className} aria-hidden="true">
          <circle cx="100" cy="100" r="80" fill="#E8FAF5" className="dark:fill-[#122926]" />
          {/* Wallet Base */}
          <rect x="45" y="70" width="110" height="75" rx="14" fill="#13B8A6" />
          <path d="M45 84 H155" stroke="#0D9488" strokeWidth="3" />
          {/* Card Slot */}
          <rect x="60" y="52" width="80" height="30" rx="6" fill="#3B5BDB" />
          {/* Wallet Clasp */}
          <rect x="125" y="94" width="30" height="24" rx="6" fill="#FFB547" />
          <circle cx="137" cy="106" r="4" fill="#FFFFFF" />
        </svg>
      );

    case 'backup':
      return (
        <svg viewBox="0 0 200 200" fill="none" className={className} aria-hidden="true">
          <circle cx="100" cy="100" r="80" fill="#EDF3FF" className="dark:fill-[#16223B]" />
          {/* Cloud Body */}
          <path
            d="M65 125 C50 125 40 112 45 98 C48 85 62 76 75 80 C82 60 106 50 125 60 C138 68 144 80 142 92 C155 93 162 105 158 116 C155 124 147 125 140 125 Z"
            fill="#FFFFFF"
            className="dark:fill-[#1E293B]"
            stroke="#55C2FF"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          {/* Upward Transfer Arrow */}
          <circle cx="100" cy="105" r="20" fill="#3B5BDB" />
          <path d="M100 115 V95 M93 102 L100 95 L107 102" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'search':
    default:
      return (
        <svg viewBox="0 0 200 200" fill="none" className={className} aria-hidden="true">
          <circle cx="100" cy="100" r="80" fill="#F1F5F9" className="dark:fill-[#1E293B]" />
          {/* Magnifier */}
          <circle cx="90" cy="90" r="38" stroke="#3B5BDB" strokeWidth="6" fill="#FFFFFF" className="dark:fill-[#0F172A]" />
          <line x1="118" y1="118" x2="150" y2="150" stroke="#FF6B6B" strokeWidth="7" strokeLinecap="round" />
          {/* Sparkles */}
          <circle cx="78" cy="78" r="4" fill="#FFB547" />
          <circle cx="102" cy="74" r="3" fill="#13B8A6" />
        </svg>
      );
  }
};
