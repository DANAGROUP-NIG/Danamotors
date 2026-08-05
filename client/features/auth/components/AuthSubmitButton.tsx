"use client";

import { Button } from "@/components/ui/button";

interface AuthSubmitButtonProps {
  isLoading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export function AuthSubmitButton({
  isLoading = false,
  loadingText = "Loading...",
  children,
}: AuthSubmitButtonProps) {
  return (
    <Button
      type="submit"
      size="lg"
      className="mt-2"
      disabled={isLoading}
    >
      {isLoading ? loadingText : children}
    </Button>
  );
}
