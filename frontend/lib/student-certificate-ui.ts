import type { ModuleItem, StudentCertificateDownloadStatus } from "@/lib/api";

const DEFAULT_CERTIFICATE_PROGRESS_MESSAGE =
  "Certificate progress will appear here after your sessions and scores load.";

export function getHomeCertificateStatusLabel(
  certificate: StudentCertificateDownloadStatus | null
): string {
  if (!certificate) {
    return "Certificate tracking";
  }
  if (certificate.eligible) {
    return "Ready To Download";
  }
  return "In Progress";
}

export function getCatalogCertificateStatusLabel(
  certificate: StudentCertificateDownloadStatus | null
): string {
  if (!certificate) {
    return "Certificate tracking";
  }
  if (certificate.eligible) {
    return "Ready to download";
  }
  return "In progress";
}

export function getCertificateTone(certificate: StudentCertificateDownloadStatus | null): string {
  if (!certificate) {
    return "border-brandBlue/20 bg-brandBlueLight text-slate-900";
  }
  if (certificate.eligible) {
    return "border-brandGreen/35 bg-brandGreenLight text-slate-900";
  }
  return "border-brandYellow/35 bg-brandYellowLight text-slate-900";
}

export function getCertificateProgressMessage(
  certificate: StudentCertificateDownloadStatus | null
): string {
  return certificate?.message ?? DEFAULT_CERTIFICATE_PROGRESS_MESSAGE;
}

export function getCertificateStatusValue(
  certificate: StudentCertificateDownloadStatus | null
): string {
  return certificate?.eligible ? "Eligible" : "In Progress";
}

export function getCertificateTemplateLabel(
  certificate: StudentCertificateDownloadStatus | null
): string {
  if (!certificate) {
    return "Pending template";
  }
  if (certificate.section_name) {
    return `${certificate.section_name}${
      certificate.template_id ? ` - Template #${certificate.template_id}` : ""
    }`;
  }
  if (certificate.template_id) {
    return `Template #${certificate.template_id}`;
  }
  return "Pending template";
}

export function getStudentCoreProgramMetrics(modules: ModuleItem[]): {
  programTarget: number;
  liveCoreSessions: number;
  completedCoreSessions: number;
  averageBestScore: number | null;
} {
  const programTarget = 12;
  const coreModules = modules.filter((module) => module.module_kind === "system");
  const liveCoreSessions = coreModules.length;
  const completedCoreSessions = coreModules.filter(
    (module) => module.progress_percent >= 100
  ).length;
  const coreScores = coreModules
    .map((module) => module.assessment_score)
    .filter((score): score is number => typeof score === "number");
  const averageBestScore =
    coreScores.length > 0
      ? coreScores.reduce((total, score) => total + score, 0) / coreScores.length
      : null;

  return {
    programTarget,
    liveCoreSessions,
    completedCoreSessions,
    averageBestScore,
  };
}
