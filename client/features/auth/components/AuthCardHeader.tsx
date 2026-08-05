"use client";

import { CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AuthCardHeaderProps {
  title: string;
  badgeText?: string;
}

export function AuthCardHeader({ title, badgeText }: AuthCardHeaderProps) {
  return (
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      {badgeText && <Badge className="mt-2">{badgeText}</Badge>}
    </CardHeader>
  );
}
