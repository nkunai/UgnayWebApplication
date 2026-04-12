import { RequireRole } from "@/components/require-role";

export default function AdminWorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <RequireRole fallbackHref="/dashboard" role="admin">
      {children}
    </RequireRole>
  );
}
