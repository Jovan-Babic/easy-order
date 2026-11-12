import Image from "next/image";

// A screenshot in a device-like frame: a phone (portrait app screens) or a browser window (portal).
export function Phone({ src, alt, width = 780, height = 1720, className = "" }: { src: string; alt: string; width?: number; height?: number; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[2rem] border-[10px] border-onSurface bg-onSurface shadow-2xl ${className}`}>
      <Image src={src} alt={alt} width={width} height={height} className="block h-auto w-full rounded-[1.4rem]" sizes="(max-width: 768px) 60vw, 280px" />
    </div>
  );
}

export function Browser({ src, alt, width = 1440, height = 788 }: { src: string; alt: string; width?: number; height?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white shadow-2xl">
      <div className="flex gap-1.5 border-b border-border bg-surface px-3 py-2" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
      </div>
      <Image src={src} alt={alt} width={width} height={height} className="block h-auto w-full" sizes="(max-width: 768px) 100vw, 640px" />
    </div>
  );
}
