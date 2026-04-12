import { redirect } from "next/navigation";

export default function LegacyTeacherClassesPage() {
  redirect("/teacher/sections");
}
