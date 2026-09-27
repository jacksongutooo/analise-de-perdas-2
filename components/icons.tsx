import type { SVGProps } from "react";

// Ícones de traço simples, desenhados para este projeto (sem dependência externa).
export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconCheck = (p: IconProps) => svg({ ...p, children: <path d="M20 6 9 17l-5-5" /> });
export const IconX = (p: IconProps) => svg({ ...p, children: <path d="M18 6 6 18M6 6l12 12" /> });
export const IconChevronLeft = (p: IconProps) => svg({ ...p, children: <path d="m15 18-6-6 6-6" /> });
export const IconChevronRight = (p: IconProps) => svg({ ...p, children: <path d="m9 18 6-6-6-6" /> });
export const IconPlus = (p: IconProps) => svg({ ...p, children: <path d="M12 5v14M5 12h14" /> });
export const IconUpload = (p: IconProps) =>
  svg({ ...p, children: <path d="M12 15V4M7 9l5-5 5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /> });
export const IconFile = (p: IconProps) =>
  svg({ ...p, children: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" /> });
export const IconSheet = (p: IconProps) =>
  svg({ ...p, children: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M8 12h8v6H8zM12 12v6M8 15h8" /> });
export const IconImage = (p: IconProps) =>
  svg({
    ...p,
    children: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-5-5L5 21" />
      </>
    ),
  });
export const IconDocCheck = (p: IconProps) =>
  svg({ ...p, children: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 14l2 2 4-4" /> });
export const IconShield = (p: IconProps) =>
  svg({ ...p, children: <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6zM9 12l2 2 4-4" /> });
export const IconLock = (p: IconProps) =>
  svg({
    ...p,
    children: (
      <>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
  });
export const IconClock = (p: IconProps) =>
  svg({
    ...p,
    children: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  });
export const IconTrophy = (p: IconProps) =>
  svg({ ...p, children: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /> });
export const IconDice = (p: IconProps) =>
  svg({
    ...p,
    children: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
        <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      </>
    ),
  });
export const IconLayers = (p: IconProps) => svg({ ...p, children: <path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5" /> });
export const IconInfo = (p: IconProps) =>
  svg({
    ...p,
    children: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
  });
export const IconAlert = (p: IconProps) =>
  svg({ ...p, children: <path d="M10.3 4.2 2.6 17.5a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0zM12 9.5v4M12 17h.01" /> });
export const IconTrash = (p: IconProps) =>
  svg({ ...p, children: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /> });
export const IconEye = (p: IconProps) =>
  svg({
    ...p,
    children: (
      <>
        <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  });
export const IconSearch = (p: IconProps) =>
  svg({
    ...p,
    children: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
  });
export const IconLogout = (p: IconProps) => svg({ ...p, children: <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9" /> });
export const IconCopy = (p: IconProps) =>
  svg({
    ...p,
    children: (
      <>
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
      </>
    ),
  });
export const IconSpinner = (p: IconProps) => svg({ ...p, children: <path d="M21 12a9 9 0 1 1-6.2-8.6" /> });
export const IconCircle = (p: IconProps) => svg({ ...p, children: <circle cx="12" cy="12" r="8" /> });
export const IconExternal = (p: IconProps) =>
  svg({ ...p, children: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /> });
export const IconRefresh = (p: IconProps) =>
  svg({ ...p, children: <path d="M20 11a8 8 0 0 0-14.9-3.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.9 3.9L20 16M20 20v-4h-4" /> });

export function FileTypeIcon({ name, ...rest }: IconProps & { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png" || ext === "jpg" || ext === "jpeg") return <IconImage {...rest} />;
  if (ext === "csv" || ext === "xlsx") return <IconSheet {...rest} />;
  return <IconFile {...rest} />;
}
