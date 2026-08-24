"use client";

interface AuthFooterLinksProps {
  promptText?: string;
  linkText?: string;
  linkHref?: string;
  forgotPasswordHref?: string;
}

export function AuthFooterLinks({
  promptText,
  linkText,
  linkHref,
  forgotPasswordHref,
}: AuthFooterLinksProps) {
  if (!promptText && !forgotPasswordHref) return null;

  return (
    <div className="flex flex-col gap-2 pt-2 text-center text-sm text-muted-foreground">
      {forgotPasswordHref && (
        <a
          className="text-sm text-primary hover:underline"
          href={forgotPasswordHref}
        >
          Forgot password?
        </a>
      )}
      {promptText && linkText && linkHref && (
        <p>
          {promptText}{" "}
          <a className="text-primary hover:underline" href={linkHref}>
            {linkText}
          </a>
        </p>
      )}
    </div>
  );
}
