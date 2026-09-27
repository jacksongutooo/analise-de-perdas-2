"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./ui";

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  confirmMessage,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "ok";
  size?: "sm" | "md" | "lg";
  className?: string;
  confirmMessage?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      loading={pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
