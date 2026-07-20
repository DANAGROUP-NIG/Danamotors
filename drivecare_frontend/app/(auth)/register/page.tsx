import LandingHeader from "@/components/headers/LandingHeader";
import Container from "@/components/ui/Container";
import RegisterForm from "@/features/auth/RegisterForm";

export const metadata = {
  title: "Register - DriveCare",
};

export default function RegisterPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background">
      <LandingHeader />
      <Container>
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center px-4 py-12">
          <div className="w-full">
            <div className="mx-auto max-w-md mt-20">
              <RegisterForm />
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}
