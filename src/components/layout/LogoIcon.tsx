import { motion } from "framer-motion";

export default function LogoIcon({ size = 28 }: { size?: number }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      whileHover={{ scale: 1.1, rotate: 5 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
    >
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1a0a2e" />
          <stop offset="100%" stopColor="#0d0618" />
        </linearGradient>
        <linearGradient id="logo-book" x1="16" y1="20" x2="48" y2="45" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
        <filter id="logo-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Sanctuary badge */}
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#logo-bg)" stroke="#2d1b4e" strokeWidth="1" />

      {/* Ambient calm glow */}
      <ellipse cx="32" cy="34" rx="20" ry="16" fill="#7c3aed" opacity="0.1" />

      {/* Open book */}
      <path d="M32,24 C26,21 18,21 16,25 L16,40 C18,44 26,44 32,45 Z" fill="url(#logo-book)" />
      <path d="M32,24 C38,21 46,21 48,25 L48,40 C46,44 38,44 32,45 Z" fill="url(#logo-book)" />

      {/* Spine */}
      <line x1="32" y1="23.5" x2="32" y2="45" stroke="#3b0764" strokeWidth="1.4" opacity="0.7" />

      {/* Guiding star */}
      <g filter="url(#logo-glow)">
        <path d="M46,12 L47.3,15.7 L51,17 L47.3,18.3 L46,22 L44.7,18.3 L41,17 L44.7,15.7 Z" fill="#fbbf24" />
      </g>
    </motion.svg>
  );
}
