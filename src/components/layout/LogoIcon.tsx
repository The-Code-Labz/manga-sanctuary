import { motion, useReducedMotion } from "framer-motion";

export default function LogoIcon({ size = 28 }: { size?: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      whileHover={reduceMotion ? undefined : { rotate: -2, scale: 1.04 }}
      transition={{ type: "spring", stiffness: 280, damping: 20 }}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="58" height="58" rx="13" fill="#191713" stroke="#4A453C" strokeWidth="2" />
      <path d="M14 18.5h14c4.2 0 7.5 3.3 7.5 7.5v24H21.7A7.7 7.7 0 0 1 14 42.3V18.5Z" fill="#F0E8D9" />
      <path d="M50 18.5H36c-4.2 0-7.5 3.3-7.5 7.5v24h13.8a7.7 7.7 0 0 0 7.7-7.7V18.5Z" fill="#D94F3D" />
      <path d="M28.5 26c0-4.2 3.3-7.5 7.5-7.5" stroke="#191713" strokeWidth="2" />
      <path d="M28.5 26v24" stroke="#191713" strokeWidth="2" />
      <path d="M18.5 28h6M18.5 34h6M40 28h5.5M40 34h5.5" stroke="#191713" strokeWidth="2" strokeLinecap="round" />
      <path d="m43.5 11 1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5 1.5-3.5Z" fill="#F0E8D9" />
    </motion.svg>
  );
}
