import LandingHeader from "@/components/headers/LandingHeader";
import LoginForm from "@/features/auth/LoginForm";

export const metadata = {
  title: "Login - Dana Motors",
};

export default function LoginPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background">
      <LandingHeader />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center px-4 py-12">
        <div className="w-full">
          <div className="mx-auto max-w-md mt-20">
            <LoginForm />
          </div>
        </div>
      </div>
    </main>
  );
}
