import { redirect } from "next/navigation";

export default async function LegacyStudentModuleDetailPage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  redirect(`/modules/${moduleId}`);
}
