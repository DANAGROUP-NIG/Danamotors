"use client";

import { useAuth } from "@/features/auth/hooks/use-auth";
import AdminDashboard from "@/features/dashboard/components/AdminDashboard";
import TechnicianDashboard from "@/features/dashboard/components/TechnicianDashboard";
import ReceptionistDashboard from "@/features/dashboard/components/ReceptionistDashboard";
import AccountantDashboard from "@/features/dashboard/components/AccountantDashboard";
import WorkshopManagerDashboard from "@/features/dashboard/components/WorkshopManagerDashboard";
import ServiceAdvisorDashboard from "@/features/dashboard/components/ServiceAdvisorDashboard";
import StoreManagerDashboard from "@/features/dashboard/components/StoreManagerDashboard";

export default function DashboardPage() {
  const { role } = useAuth();

  switch (role) {
    case "technician":
      return <TechnicianDashboard />;
    case "receptionist":
      return <ReceptionistDashboard />;
    case "accountant":
      return <AccountantDashboard />;
    case "workshopmanager":
      return <WorkshopManagerDashboard />;
    case "serviceadvisor":
      return <ServiceAdvisorDashboard />;
    case "storemanager":
      return <StoreManagerDashboard />;
    // admin, superadmin, manager, viewer, and any other role
    default:
      return <AdminDashboard />;
  }
}
