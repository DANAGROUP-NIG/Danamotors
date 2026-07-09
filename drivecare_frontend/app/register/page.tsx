import "react-day-picker/style.css";
import { Header } from "@/index";
import RegisterForm from "@/features/auth/RegisterForm";

export const metadata = {
  title: "Register - DriveCare",
};

export default function RegisterPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background">
      <Header />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center px-4 py-12">
        <div className="w-full">
          <div className="mx-auto max-w-md">
            <RegisterForm />
          </div>
        </div>
      </div>
    </main>
  );
}
