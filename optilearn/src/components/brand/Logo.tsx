// [PLACEHOLDER] — swap for the real OptiLearn mark when available.

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 32, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="OptiLearn"
    >
      <defs>
        <linearGradient
          id="optilearn-mark"
          x1="4"
          y1="4"
          x2="60"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#16248C" />
          <stop offset="0.55" stopColor="#6B21A8" />
          <stop offset="1" stopColor="#108080" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#optilearn-mark)" />
      <circle cx="32" cy="32" r="15" stroke="#FFFFFF" strokeWidth="5" fill="none" />
      <circle cx="45" cy="19" r="3.2" fill="#FFFFFF" />
    </svg>
  );
}
