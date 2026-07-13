import { cn } from "@/lib/utils";

const LOGO_SRC = "/logo.png";

type SinalLogoProps = {
  size?: number;
  className?: string;
  alt?: string;
};

export function SinalLogo({ size = 32, className, alt = "Sinal" }: SinalLogoProps) {
  return (
    <img
      src={LOGO_SRC}
      alt={alt}
      width={size}
      height={size}
      className={cn("rounded-[22%] object-cover shrink-0 select-none", className)}
      draggable={false}
    />
  );
}

export { LOGO_SRC };
