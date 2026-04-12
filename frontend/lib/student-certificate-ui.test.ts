import { describe, expect, it } from "vitest";

import type { ModuleItem, StudentCertificateDownloadStatus } from "@/lib/api";
import {
  getCatalogCertificateStatusLabel,
  getCertificateProgressMessage,
  getCertificateStatusValue,
  getCertificateTemplateLabel,
  getCertificateTone,
  getHomeCertificateStatusLabel,
  getStudentCoreProgramMetrics,
} from "@/lib/student-certificate-ui";

function makeModule(overrides: Partial<ModuleItem> = {}): ModuleItem {
  return {
    id: 1,
    slug: "module-1",
    title: "Module 1: Intro",
    description: "Intro module",
    order_index: 1,
    module_kind: "system",
    owner_teacher: null,
    is_shared_pool: false,
    source_module_id: null,
    cover_image_url: null,
    lessons: [],
    assessments: [],
    activities: [],
    is_locked: false,
    is_published: true,
    status: "not_started",
    progress_percent: 0,
    assessment_score: null,
    ...overrides,
  };
}

describe("student certificate UI mapping", () => {
  it("maps home and catalog badge labels correctly", () => {
    const eligible: StudentCertificateDownloadStatus = {
      eligible: true,
      message: "Ready",
      section_name: "Batch A",
      template_id: 5,
    };

    expect(getHomeCertificateStatusLabel(null)).toBe("Certificate tracking");
    expect(getHomeCertificateStatusLabel(eligible)).toBe("Ready To Download");
    expect(getCatalogCertificateStatusLabel(eligible)).toBe("Ready to download");
    expect(getCatalogCertificateStatusLabel({ eligible: false, message: "Not yet" })).toBe(
      "In progress"
    );
  });

  it("maps message, tone, status value, and template display", () => {
    const eligible: StudentCertificateDownloadStatus = {
      eligible: true,
      message: "Certificate requirements completed.",
      section_name: "Cohort Blue",
      template_id: 11,
    };

    expect(getCertificateProgressMessage(eligible)).toBe("Certificate requirements completed.");
    expect(getCertificateTone(eligible)).toContain("border-brandGreen");
    expect(getCertificateStatusValue(eligible)).toBe("Eligible");
    expect(getCertificateTemplateLabel(eligible)).toBe("Cohort Blue - Template #11");

    expect(getCertificateProgressMessage(null)).toBe(
      "Certificate progress will appear here after your sessions and scores load."
    );
    expect(getCertificateTone(null)).toContain("border-brandBlue");
    expect(getCertificateStatusValue(null)).toBe("In Progress");
    expect(getCertificateTemplateLabel({ eligible: false, message: "Not ready" })).toBe(
      "Pending template"
    );
  });

  it("derives core program metrics from modules", () => {
    const metrics = getStudentCoreProgramMetrics([
      makeModule({
        id: 1,
        slug: "module-1",
        order_index: 1,
        progress_percent: 100,
        assessment_score: 80,
      }),
      makeModule({
        id: 2,
        slug: "module-2",
        order_index: 2,
        progress_percent: 60,
        assessment_score: 70,
      }),
      makeModule({
        id: 9,
        slug: "teacher-practice",
        title: "Teacher Practice",
        order_index: 1,
        module_kind: "teacher_custom",
        progress_percent: 100,
        assessment_score: 100,
      }),
    ]);

    expect(metrics.programTarget).toBe(12);
    expect(metrics.liveCoreSessions).toBe(2);
    expect(metrics.completedCoreSessions).toBe(1);
    expect(metrics.averageBestScore).toBe(75);
  });
});
