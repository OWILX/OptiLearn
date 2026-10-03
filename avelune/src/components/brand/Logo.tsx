interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 32, className }: LogoProps) {
  return (
    <img
      src="/avelune-logo.png"
      width={size}
      height={size}
      className={className}
      alt="Avelune"
      draggable={false}
    />
  );
}
