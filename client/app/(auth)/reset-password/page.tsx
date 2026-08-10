import LandingHeader from "@/components/headers/LandingHeader";
import ResetPasswordForm from "@/features/auth/ResetPasswordForm";

export const metadata = {
  title: "Reset Password - Dana Motors",
};

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-background">
      <LandingHeader />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center px-4 py-12">
        <div className="w-full">
          <div className="mx-auto max-w-md">
            <ResetPasswordForm />
          </div>
        </div>
      </div>
    </main>
  );
}
