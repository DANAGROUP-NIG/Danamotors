import LandingHeader from "@/components/headers/LandingHeader";
import ForgotPasswordForm from "@/features/auth/ForgotPasswordForm";

export const metadata = {
  title: "Forgot Password - Dana Motors",
};

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen bg-background">
      <LandingHeader />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center px-4 py-12">
        <div className="w-full">
          <div className="mx-auto max-w-md">
            <ForgotPasswordForm />
          </div>
        </div>
      </div>
    </main>
  );
}
