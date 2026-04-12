function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function resolveApiBase(): string {
  const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configuredBase) {
    if (typeof window !== "undefined") {
      try {
        const configuredUrl = new URL(configuredBase);
        // If frontend is accessed over LAN, but env still points to localhost,
        // auto-rewrite host to the current browser host to avoid network fetch failures.
        if (isLocalHostname(configuredUrl.hostname) && !isLocalHostname(window.location.hostname)) {
          configuredUrl.hostname = window.location.hostname;
          configuredUrl.protocol = window.location.protocol;
          return configuredUrl.toString().replace(/\/$/, "");
        }
      } catch {
        // Ignore malformed env values; fallback logic below will apply.
      }
    }
    return configuredBase;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000/api`;
  }

  return "http://localhost:8000/api";
}

export function resolveUploadsBase(): string {
  return resolveApiBase().replace(/\/api\/?$/, "");
}

export function resolveUploadUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (path.startsWith("/")) {
    return `${resolveUploadsBase()}${path}`;
  }
  if (path.startsWith("uploads/")) {
    return `${resolveUploadsBase()}/${path}`;
  }
  return path;
}

function getStoredToken(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const token = window.localStorage.getItem("auth_token");
  return token && token.trim() ? token : undefined;
}

function buildQuery(
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type ApiUser = {
  id: number;
  username: string;
  role?: "student" | "teacher" | "admin";
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  address?: string | null;
  birth_date?: string | null;
  profile_image_path?: string | null;
  must_change_password?: boolean;
};

export type AuthResponse = {
  token: string;
  user: ApiUser;
};

export type LmsSectionMember = {
  id: number;
  username: string;
  role: "student" | "teacher" | "admin";
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  assigned_at?: string | null;
  course_completed_at?: string | null;
  auto_archive_due_at?: string | null;
};

export type LmsSection = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  status: "active" | "archived";
  teacher_count: number;
  student_count: number;
  teachers: LmsSectionMember[];
  students: LmsSectionMember[];
};

export type AdminDashboard = {
  total_students: number;
  total_teachers: number;
  total_sections: number;
  active_sections: number;
  pending_certificate_approvals: number;
  recent_accounts: (ApiUser & { created_at: string })[];
};

export type AdminUser = ApiUser & {
  must_change_password: boolean;
  created_at: string;
  archived_at?: string | null;
};

export type BulkAccountCreateRow = {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  section_id?: number | null;
};

export type BulkAccountImportResult = {
  email: string;
  username: string;
  temporary_password: string;
  delivery_status: "sent" | "skipped";
  section_id?: number | null;
};

export type BulkAccountImportJob = {
  processed_count: number;
  sent_count: number;
  skipped_count: number;
  results: BulkAccountImportResult[];
};

export type LmsModuleItemType =
  | "readable"
  | "video_resource"
  | "document_resource"
  | "interactive_resource"
  | "external_link_resource"
  | "multiple_choice_assessment"
  | "identification_assessment"
  | "signing_lab_assessment";

export type ModuleAssetKind = "video" | "image" | "document" | "interactive";

export type ModuleAsset = {
  resource_kind: ModuleAssetKind;
  resource_file_name: string;
  resource_file_path: string;
  resource_mime_type?: string | null;
  resource_url?: string | null;
  label?: string | null;
};

export type LmsModuleItem = {
  id: number;
  title: string;
  item_type: LmsModuleItemType;
  order_index: number;
  instructions?: string | null;
  content_text?: string | null;
  config: Record<string, unknown>;
  is_required: boolean;
  is_published: boolean;
};

export type TeacherSectionModule = {
  id: number;
  section_id: number;
  title: string;
  description: string;
  order_index: number;
  is_published: boolean;
  items: LmsModuleItem[];
};

export type TeacherSectionSummary = {
  section: LmsSection;
  draft_module_count: number;
  published_module_count: number;
  pending_certificate_status?: string | null;
};

export type StudentCourseItem = {
  id: number;
  title: string;
  item_type: LmsModuleItemType;
  order_index: number;
  instructions?: string | null;
  content_text?: string | null;
  config: Record<string, unknown>;
  is_locked: boolean;
  status: string;
  attempt_count: number;
  response_text?: string | null;
  score_percent?: number | null;
  is_correct?: boolean | null;
};

export type StudentCourseModule = {
  id: number;
  title: string;
  description: string;
  order_index: number;
  is_locked: boolean;
  status: string;
  progress_percent: number;
  items: StudentCourseItem[];
};

export type StudentCourse = {
  section: LmsSection | null;
  modules: StudentCourseModule[];
};

export type StudentProgressUpdate = {
  module_id: number;
  item_id: number;
  module_status: string;
  module_progress_percent: number;
  item_status: string;
  is_correct?: boolean | null;
  score_percent?: number | null;
};

export type TeacherStudentModuleReport = {
  module_id: number;
  module_title: string;
  status: string;
  progress_percent: number;
  correct_count: number;
  wrong_count: number;
  attempt_count: number;
  total_duration_seconds: number;
  item_reports?: TeacherStudentItemReport[];
};

export type TeacherStudentItemReport = {
  item_id: number;
  item_title: string;
  item_type: LmsModuleItemType;
  order_index: number;
  status: string;
  is_correct?: boolean | null;
  score_percent?: number | null;
  attempt_count: number;
  duration_seconds: number;
  completed_at?: string | null;
};

export type TeacherStudentProgressReport = {
  student: LmsSectionMember;
  section: LmsSection | null;
  current_finished_module?: string | null;
  verdict: string;
  module_reports: TeacherStudentModuleReport[];
};

export type CertificateTemplateSummary = {
  id: number;
  section_id: number;
  section_name: string;
  original_file_name: string;
  status: string;
  review_remarks?: string | null;
  created_at: string;
};

export type StudentCertificateDownloadStatus = {
  eligible: boolean;
  template_id?: number | null;
  section_name?: string | null;
  message: string;
};

export type LoginActivityEvent = {
  session_id: number;
  user_id: number;
  username: string;
  role: "student" | "teacher" | "admin";
  logged_in_at: string;
  expires_at: string;
  is_active: boolean;
};

export type LoginActivityReport = {
  total_logins_last_24h: number;
  active_sessions: number;
  logins_last_24h_by_role: Record<string, number>;
  events: LoginActivityEvent[];
};

export type AdminAuditEvent = {
  id: number;
  admin_user_id: number;
  admin_username: string;
  action_type: string;
  target_type: string;
  target_id?: number | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type SystemActivityEvent = {
  id: number;
  actor_user_id: number;
  actor_username: string;
  actor_role: "student" | "teacher" | "admin";
  actor_email?: string | null;
  actor_first_name?: string | null;
  actor_last_name?: string | null;
  actor_company_name?: string | null;
  action_type: string;
  target_type: string;
  target_id?: number | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type ForgotPasswordRequestResponse = {
  message: string;
};

export type ForgotPasswordConfirmOtpResponse = {
  message: string;
  reset_token: string;
};

export type TeacherInviteVerifyQrResponse = {
  invite_code: string;
  label: string | null;
  expires_at: string | null;
  remaining_uses: number | null;
  message: string;
};

export type TeacherInviteVerifyPasskeyResponse = {
  onboarding_token: string;
  expires_at: string | null;
  remaining_uses: number | null;
  message: string;
};

export type TeacherInviteIssueCredentialsResponse = {
  message: string;
  username: string;
};

export type TeacherStudentReportRow = {
  student_id: number;
  student_name: string;
  student_email?: string | null;
  total_assessments: number;
  pending_reports: number;
  generated_reports: number;
  average_score_percent: number;
  latest_activity_at?: string | null;
};

export type TeacherStudentReportTableResponse = {
  students: TeacherStudentReportRow[];
};

export type TeacherModuleSummary = {
  module_id: number;
  module_title: string;
  assessments_taken: number;
  right_count: number;
  wrong_count: number;
  total_items: number;
  score_percent: number;
};

export type TeacherImprovementAreaItem = {
  area: string;
  count: number;
};

export type TeacherGeneratedStudentReport = {
  student_id: number;
  student_name: string;
  student_email?: string | null;
  generated_at: string;
  total_assessments: number;
  pending_reports_before_generate: number;
  total_right: number;
  total_wrong: number;
  total_items: number;
  overall_score_percent: number;
  modules: TeacherModuleSummary[];
  top_improvement_areas: TeacherImprovementAreaItem[];
};

export type RegistrationPayload = {
  first_name: string;
  middle_name?: string;
  last_name: string;
  birth_date: string;
  address: string;
  email: string;
  phone_number: string;
  reference_number: string;
  reference_image: File;
};

export type RegistrationRecord = {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  address: string | null;
  email: string;
  phone_number: string;
  reference_number: string;
  reference_image_path: string | null;
  status: string;
  validated_at: string | null;
  validated_by: string | null;
  linked_user_id: number | null;
  issued_username: string | null;
  enrollment_id: number | null;
  payment_review_status: string | null;
  notes: string | null;
  created_at: string;
};

export type RegistrationSubmitResponse = {
  message: string;
  registration: RegistrationRecord;
};

export type ProfileUpdatePayload = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  address?: string | null;
  birth_date?: string | null;
};

export type ProgressSummary = {
  completed_modules: number;
  total_modules: number;
  overall_progress_percent: number;
};

export type LessonReference = {
  id: string;
  title: string;
  image_url: string;
  source_url: string;
  credit?: string;
  license?: string;
  letters?: string[];
};

export type Lesson = {
  id: string;
  title: string;
  content: string;
  references?: LessonReference[];
};

export type Assessment = {
  id: string;
  question: string;
  choices: string[];
  answer: string;
};

export type ModuleActivity = {
  id: number;
  activity_key: string;
  title: string;
  activity_type: string;
  order_index: number;
  instructions: string | null;
  definition: Record<string, unknown>;
  is_published: boolean;
};

export type ModuleItem = {
  id: number;
  slug: string;
  title: string;
  description: string;
  order_index: number;
  module_kind: "system" | "teacher_custom";
  owner_teacher: TeacherUserSummary | null;
  is_shared_pool: boolean;
  source_module_id: number | null;
  cover_image_url: string | null;
  lessons: Lesson[];
  assessments: Assessment[];
  activities: ModuleActivity[];
  is_locked: boolean;
  is_published: boolean;
  status: "not_started" | "in_progress" | "completed";
  progress_percent: number;
  assessment_score: number | null;
};

export type TeacherAssessmentReport = {
  id: number;
  student_id: number;
  module_id: number;
  module_title: string;
  module_kind: "system" | "teacher_custom";
  module_owner_teacher: TeacherUserSummary | null;
  handled_by_teacher: TeacherUserSummary | null;
  handling_session_id: number | null;
  handling_started_at: string | null;
  assessment_id: string;
  assessment_title: string;
  right_count: number;
  wrong_count: number;
  total_items: number;
  score_percent: number;
  improvement_areas: string[];
  status: string;
  created_at: string;
};

export type TeacherBatch = {
  id: number;
  code: string;
  name: string;
  status: "active" | "archived";
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
  notes: string | null;
  student_count: number;
  primary_teacher: TeacherUserSummary | null;
  created_at: string | null;
};

export type TeacherUserSummary = {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
};

export type TeacherStudentModuleProgress = {
  module_id: number;
  module_title: string;
  module_kind: "system" | "teacher_custom";
  owner_teacher: TeacherUserSummary | null;
  status: string;
  progress_percent: number;
  assessment_score: number | null;
  updated_at: string;
};

export type TeacherHandlingSession = {
  id: number;
  status: "active" | "ended";
  started_at: string;
  ended_at: string | null;
  teacher: TeacherUserSummary;
  batch: TeacherBatch | null;
  student: TeacherUserSummary | null;
};

export type TeacherPresence = {
  teacher: TeacherUserSummary;
  status: "online" | "offline";
  updated_at: string;
};

export type TeacherStudent = {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  address: string | null;
  birth_date: string | null;
  role: string;
  enrollment_status: string | null;
  batch: TeacherBatch | null;
  resolved_teacher: TeacherUserSummary | null;
  active_handling_session: TeacherHandlingSession | null;
  module_progress: TeacherStudentModuleProgress[];
};

export type TeacherModuleCard = {
  id: number;
  slug: string;
  title: string;
  description: string;
  order_index: number;
  module_kind: "system" | "teacher_custom";
  is_published: boolean;
  is_shared_pool: boolean;
  source_module_id: number | null;
  source_module_title: string | null;
  cover_image_url: string | null;
  archived_at: string | null;
  owner_teacher: TeacherUserSummary | null;
  lesson_count: number;
  activity_count: number;
};

export type TeacherModulesCatalog = {
  managed_student_count: number;
  my_modules: TeacherModuleCard[];
  shared_pool: TeacherModuleCard[];
  system_templates: TeacherModuleCard[];
};

export type TeacherModuleCreatePayload = {
  title: string;
  description: string;
};

export type TeacherModuleUpdatePayload = {
  title?: string | null;
  description?: string | null;
  is_published?: boolean | null;
  is_shared_pool?: boolean | null;
};

export type TeacherPresenceUpdatePayload = {
  status: "online" | "offline";
};

export type TeacherHandlingSessionCreatePayload = {
  batch_id?: number | null;
  student_id?: number | null;
};

export type TeacherStudentCertificateModule = {
  module_id: number;
  module_title: string;
  order_index: number;
  completed: boolean;
  latest_score: number | null;
  best_score: number | null;
  certificate_score_used: number | null;
  passed: boolean;
};

export type TeacherStudentCertificateSummary = {
  target_required_modules: number;
  effective_required_modules: number;
  completed_required_modules: number;
  average_best_score: number;
  eligible: boolean;
  reason: string;
};

export type TeacherStudentCertificateRecord = {
  status: "approved" | "rejected";
  decision_note: string | null;
  decided_at: string;
  decided_by_name: string;
  issued_at: string | null;
  certificate_reference: string;
};

export type TeacherStudentCertificateTemplate = {
  student_name: string;
  certificate_title: string;
  completion_statement: string;
  issue_date: string;
  approving_teacher_name: string;
  certificate_reference: string;
  effective_required_modules: number;
  completed_required_modules: number;
  average_best_score: number;
};

export type TeacherStudentCertificate = {
  student_id: number;
  student_name: string;
  modules: TeacherStudentCertificateModule[];
  summary: TeacherStudentCertificateSummary;
  record: TeacherStudentCertificateRecord | null;
  template: TeacherStudentCertificateTemplate | null;
};

export type StudentCertificateStatus = TeacherStudentCertificate;

export type TeacherStudentCertificateDecisionPayload = {
  decision: "approve" | "reject";
  note?: string | null;
};

export type TeacherCertificateHistoryItem = {
  id: number;
  student: TeacherUserSummary;
  batch: TeacherBatch | null;
  status: "approved" | "rejected";
  certificate_reference: string;
  decision_note: string | null;
  decided_at: string;
  decided_by_name: string;
  issued_at: string | null;
};

export type TeacherEnrollment = {
  id: number;
  status: string;
  payment_review_status: string;
  review_notes: string | null;
  rejection_reason_code: "incorrect_amount_paid" | "incorrect_information" | null;
  rejection_reason_detail: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  teacher_assignment_request_status: "none" | "pending" | "approved" | "rejected";
  teacher_assignment_request_note: string | null;
  teacher_assignment_requested_at: string | null;
  teacher_assignment_reviewed_at: string | null;
  teacher_assignment_decision_note: string | null;
  created_at: string;
  updated_at: string;
  registration: RegistrationRecord;
  batch: TeacherBatch | null;
  student: TeacherUserSummary | null;
  requested_teacher: TeacherUserSummary | null;
  teacher_assignment_reviewed_by: TeacherUserSummary | null;
};

export type TeacherEnrollmentApprovalResult = {
  enrollment: TeacherEnrollment;
  issued_username: string;
  temporary_password: string;
  delivery_status: "sent" | "skipped";
  delivery_message: string;
  recipient_email: string;
};

export type TeacherEnrollmentRejectionResult = {
  enrollment: TeacherEnrollment;
  delivery_status: "sent" | "skipped" | "failed";
  delivery_message: string;
  recipient_email: string;
};

export type TeacherEnrollmentApprovePayload = {
  batch_id?: number | null;
  batch_code?: string | null;
  batch_name?: string | null;
  issued_username?: string | null;
  temporary_password?: string | null;
  notes?: string | null;
  send_email?: boolean;
};

export type TeacherEnrollmentRejectPayload = {
  internal_note: string | null;
  rejection_reason_code: "incorrect_amount_paid" | "incorrect_information";
  rejection_reason_detail?: string | null;
};

export type TeacherEnrollmentAssignBatchPayload = {
  batch_id?: number | null;
  batch_code?: string | null;
  batch_name?: string | null;
  notes?: string | null;
};

export type TeacherEnrollmentRequestManagementPayload = {
  note?: string | null;
};

export type TeacherEnrollmentApproveManagementPayload = {
  batch_id?: number | null;
  batch_code?: string | null;
  batch_name?: string | null;
  decision_note?: string | null;
};

export type TeacherEnrollmentRejectManagementPayload = {
  decision_note?: string | null;
};

export type TeacherBatchCreatePayload = {
  code: string;
  name: string;
  status?: "active" | "archived";
  start_date?: string | null;
  end_date?: string | null;
  capacity?: number | null;
  notes?: string | null;
  primary_teacher_id?: number | null;
};

export type TeacherBatchAssignTeacherPayload = {
  teacher_id: number;
};

export type TeacherActivityAttemptItem = {
  id: number;
  item_key: string;
  prompt: string | null;
  expected_answer: string | null;
  student_answer: string | null;
  is_correct: boolean | null;
  confidence: number | null;
  ai_metadata: Record<string, unknown>;
};

export type TeacherActivityAttempt = {
  id: number;
  student_id: number;
  student_name: string;
  module_id: number;
  module_title: string;
  module_kind: "system" | "teacher_custom";
  module_owner_teacher: TeacherUserSummary | null;
  handled_by_teacher: TeacherUserSummary | null;
  handling_session_id: number | null;
  handling_started_at: string | null;
  activity_id: number;
  activity_key: string;
  activity_title: string;
  activity_type: string;
  right_count: number;
  wrong_count: number;
  total_items: number;
  score_percent: number;
  improvement_areas: string[];
  ai_metadata: Record<string, unknown>;
  submitted_at: string;
  items: TeacherActivityAttemptItem[];
};

export type TeacherWeakItem = {
  module_id: number;
  module_title: string;
  activity_key: string;
  activity_title: string;
  item_key: string;
  prompt: string | null;
  expected_answer: string | null;
  wrong_count: number;
  attempt_count: number;
  wrong_rate_percent: number;
};

export type TeacherAttentionStudent = {
  student_id: number;
  student_name: string;
  student_email: string | null;
  batch_id: number | null;
  batch_name: string | null;
  attempt_count: number;
  average_score_percent: number;
  low_score_count: number;
  latest_attempt_at: string;
};

export type TeacherConcernAttempt = {
  attempt_id: number;
  student_id: number;
  student_name: string;
  batch_id: number | null;
  batch_name: string | null;
  module_id: number;
  module_title: string;
  activity_key: string;
  activity_title: string;
  score_percent: number;
  low_confidence_item_count: number;
  submitted_at: string;
};

export type TeacherReportSummary = {
  batch_id: number | null;
  module_id: number | null;
  registered_student_count: number;
  total_students: number;
  total_attempts: number;
  average_score_percent: number;
  weak_items: TeacherWeakItem[];
  students_needing_attention: TeacherAttentionStudent[];
  recent_concern_attempts: TeacherConcernAttempt[];
};

export type TeacherBreakdownModuleMetric = {
  module_id: number;
  module_title: string;
  count: number;
};

export type TeacherBatchBreakdownRow = {
  student_id: number;
  student_name: string;
  average_score_percent: number;
  attempt_count: number;
  latest_attempt_at: string;
  highest_correct_module: TeacherBreakdownModuleMetric | null;
  highest_incorrect_module: TeacherBreakdownModuleMetric | null;
};

export type TeacherModuleBreakdownRow = {
  batch_id: number | null;
  batch_name: string;
  average_score_percent: number;
  attempt_count: number;
  correct_answers: number;
  incorrect_answers: number;
};

export type TeacherAllBreakdownRow = {
  student_id: number;
  student_name: string;
  batch_id: number | null;
  batch_name: string;
  average_score_percent: number | null;
  attempt_count: number;
  latest_attempt_at: string | null;
};

export type TeacherAllBreakdown = {
  mode: "all";
  rows: TeacherAllBreakdownRow[];
};

export type TeacherBatchBreakdown = {
  mode: "batch";
  batch_id: number;
  batch_name: string | null;
  rows: TeacherBatchBreakdownRow[];
};

export type TeacherModuleBreakdown = {
  mode: "module";
  module_id: number;
  module_title: string | null;
  rows: TeacherModuleBreakdownRow[];
};

export type TeacherBatchModuleBreakdownRow = {
  student_id: number;
  student_name: string;
  average_score_percent: number;
  attempt_count: number;
  correct_answers: number;
  incorrect_answers: number;
  latest_attempt_at: string;
};

export type TeacherBatchModuleBreakdown = {
  mode: "batch_module";
  batch_id: number;
  batch_name: string | null;
  module_id: number;
  module_title: string | null;
  rows: TeacherBatchModuleBreakdownRow[];
};

export type TeacherReportBreakdownResponse =
  | TeacherAllBreakdown
  | TeacherBatchBreakdown
  | TeacherModuleBreakdown
  | TeacherBatchModuleBreakdown;

export type ActivityAttemptItemPayload = {
  item_key: string;
  prompt?: string | null;
  expected_answer?: string | null;
  student_answer?: string | null;
  is_correct?: boolean | null;
  confidence?: number | null;
  ai_metadata?: Record<string, unknown>;
};

export type ActivityAttemptPayload = {
  right_count: number;
  wrong_count: number;
  total_items: number;
  score_percent: number;
  improvement_areas?: string[];
  ai_metadata?: Record<string, unknown>;
  source?: string;
  notes?: string | null;
  items?: ActivityAttemptItemPayload[];
  completed_lesson_id?: string | null;
  mark_module_completed?: boolean;
};

export type ActivityAttemptResponse = {
  id: number;
  module_id: number;
  module_activity_id: number;
  activity_key: string;
  activity_title: string;
  activity_type: string;
  right_count: number;
  wrong_count: number;
  total_items: number;
  score_percent: number;
  improvement_areas: string[];
  ai_metadata: Record<string, unknown>;
  source: string;
  items: TeacherActivityAttemptItem[];
  progress: ModuleItem;
};

export type LabPrediction = {
  prediction: string;
  confidence: number;
  top_candidates: string[];
};

export type OpenPalmDetection = {
  open_palm: boolean;
};

export type RecognitionMode = "alphabet" | "numbers" | "words";
export type NumbersCategory =
  | "0-10"
  | "11-20"
  | "21-30"
  | "31-40"
  | "41-50"
  | "51-60"
  | "61-70"
  | "71-80"
  | "81-90"
  | "91-100";
export type WordsCategory =
  | "greeting"
  | "responses"
  | "date"
  | "family"
  | "relationship"
  | "color";

export type AlphabetDatasetStatus = {
  datasets_root: string;
  kaggle_zip_found: boolean;
  kaggle_zip_valid: boolean;
  kaggle_zip_error: string | null;
  kaggle_zip_path: string;
  kaggle_collated_found: boolean;
  kaggle_collated_path: string;
  kaggle_classes: string[];
  kaggle_total_images: number;
  github_model_found: boolean;
  github_scaler_found: boolean;
  github_model_path: string;
  github_scaler_path: string;
  supported_labels: string[];
  ready_for_alphabet_mode: boolean;
};

export type AlphabetModelStatus = {
  model_found: boolean;
  model_path: string;
  classes: string[];
  confidence_threshold: number;
  min_top2_margin: number;
  ready: boolean;
};

export type NumbersDatasetStatus = {
  dataset_path: string;
  dataset_found: boolean;
  class_labels: string[];
  class_counts: Record<string, number>;
  missing_labels: string[];
  total_images: number;
  ready_for_training: boolean;
};

export type NumbersModelStatus = {
  model_found: boolean;
  model_path: string;
  classes: string[];
  confidence_threshold: number;
  min_top2_margin: number;
  ten_motion_model_found: boolean;
  ten_motion_model_path: string;
  ten_motion_ready: boolean;
  supports_ten_dynamic: boolean;
  ten_sequence_frames: number;
  ten_min_sequence_frames: number;
  motion_model_found: boolean;
  motion_model_path: string;
  motion_ready: boolean;
  supports_11_100_dynamic: boolean;
  motion_sequence_frames: number;
  motion_min_sequence_frames: number;
  ready: boolean;
};

export type WordsDatasetStatus = {
  dataset_root: string;
  processed_path: string;
  clips_root: string;
  train_rows: number;
  test_rows: number;
  train_clips_found: number;
  test_clips_found: number;
  missing_train_clips: number;
  missing_test_clips: number;
  available_labels: string[];
  available_label_count: number;
  available_category_count: number;
  excluded_categories: string[];
  ready_for_training: boolean;
};

export type WordsModelStatus = {
  model_found: boolean;
  model_path: string;
  classes: string[];
  confidence_threshold: number;
  min_top2_margin: number;
  force_best_prediction: boolean;
  sequence_frames: number;
  min_sequence_frames: number;
  ready: boolean;
};

type TeacherAssessmentReportsResponse = {
  reports: TeacherAssessmentReport[];
};

function formatApiErrorDetail(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => formatApiErrorDetail(item))
      .filter((item) => item && item !== "Request failed");
    return parts.length > 0 ? parts.join(" ") : "Request failed";
  }

  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const message =
      (typeof record.msg === "string" && record.msg) ||
      (typeof record.message === "string" && record.message) ||
      (typeof record.detail === "string" && record.detail);

    if (message) {
      const location = Array.isArray(record.loc)
        ? record.loc
            .map((part) => String(part))
            .filter((part) => part !== "body")
            .join(".")
        : "";
      return location ? `${location}: ${message}` : message;
    }
  }

  return "Request failed";
}

async function performRequest(path: string, options?: RequestInit, token?: string): Promise<Response> {
  const apiBase = resolveApiBase();
  const headers = new Headers(options?.headers);
  if (!(options?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const authToken = token ?? getStoredToken();
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown network error";
    throw new Error(
      `Unable to reach API at ${apiBase}. ${reason}. Make sure the backend server is running and NEXT_PUBLIC_API_BASE_URL is correct.`
    );
  }

  if (!response.ok) {
    const fallback = "Request failed";
    let detail = fallback;
    try {
      const data = (await response.json()) as { detail?: unknown; message?: unknown };
      detail =
        formatApiErrorDetail(data.detail) ||
        formatApiErrorDetail(data.message) ||
        fallback;
    } catch {
      try {
        detail = (await response.text()) || fallback;
      } catch {}
    }
    throw new Error(detail);
  }

  return response;
}

async function request<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  const response = await performRequest(path, options, token);
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function requestBlob(path: string, options?: RequestInit, token?: string): Promise<Blob> {
  const response = await performRequest(path, options, token);
  return response.blob();
}

export function register(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function requestForgotPasswordOtp(
  usernameOrEmail: string
): Promise<ForgotPasswordRequestResponse> {
  return request<ForgotPasswordRequestResponse>("/auth/forgot-password/request", {
    method: "POST",
    body: JSON.stringify({ username_or_email: usernameOrEmail }),
  });
}

export function verifyForgotPasswordOtp(
  usernameOrEmail: string,
  otpCode: string,
  newPassword: string
): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/forgot-password/verify", {
    method: "POST",
    body: JSON.stringify({
      username_or_email: usernameOrEmail,
      otp_code: otpCode,
      new_password: newPassword,
    }),
  });
}

export function verifyTeacherInviteQr(qrPayload: string): Promise<TeacherInviteVerifyQrResponse> {
  return request<TeacherInviteVerifyQrResponse>("/auth/teacher-invite/verify-qr", {
    method: "POST",
    body: JSON.stringify({ qr_payload: qrPayload }),
  });
}

export function verifyTeacherInvitePasskey(
  inviteCode: string,
  passkey: string
): Promise<TeacherInviteVerifyPasskeyResponse> {
  return request<TeacherInviteVerifyPasskeyResponse>("/auth/teacher-invite/verify-passkey", {
    method: "POST",
    body: JSON.stringify({ invite_code: inviteCode, passkey }),
  });
}

export function issueTeacherCredentials(
  onboardingToken: string,
  email: string
): Promise<TeacherInviteIssueCredentialsResponse> {
  return request<TeacherInviteIssueCredentialsResponse>("/auth/teacher-invite/issue-credentials", {
    method: "POST",
    body: JSON.stringify({ onboarding_token: onboardingToken, email }),
  });
}

export function getCurrentUser(token: string): Promise<ApiUser> {
  return request<ApiUser>("/auth/me", undefined, token);
}

export function getAdminDashboard(token?: string): Promise<AdminDashboard> {
  return request<AdminDashboard>("/admin/dashboard", undefined, token);
}

export function getAdminUsers(
  role?: "student" | "teacher" | "admin",
  options?: { includeArchived?: boolean },
  token?: string
) {
  const query = buildQuery({
    role,
    include_archived: options?.includeArchived ?? false,
  });
  return request<AdminUser[]>(`/admin/users${query}`, undefined, token);
}

export function bulkImportAccounts(
  payload: { role: "student" | "teacher"; batch_size?: number; accounts: BulkAccountCreateRow[] },
  token?: string
): Promise<BulkAccountImportJob> {
  return request<BulkAccountImportJob>(
    "/admin/accounts/import",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function resendCredentials(userId: number, token?: string): Promise<{ message: string; delivery_status: string; temporary_password: string }> {
  return request<{ message: string; delivery_status: string; temporary_password: string }>(
    `/admin/users/${userId}/resend-credentials`,
    { method: "POST" },
    token
  );
}

export function deactivateUser(userId: number, token?: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/admin/users/${userId}/deactivate`, { method: "POST" }, token);
}

export function reactivateUser(userId: number, token?: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/admin/users/${userId}/reactivate`, { method: "POST" }, token);
}

export function archiveTeacherAccount(teacherId: number, token?: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/admin/teachers/${teacherId}/archive`, { method: "POST" }, token);
}

export function unarchiveStudentAccount(studentId: number, token?: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/admin/students/${studentId}/unarchive`, { method: "POST" }, token);
}

export function archiveNonAdminAccounts(token?: string): Promise<{ message: string; count: number }> {
  return request<{ message: string; count: number }>(
    "/admin/accounts/archive-non-admin",
    { method: "POST" },
    token
  );
}

export function getAdminSections(token?: string): Promise<LmsSection[]> {
  return request<LmsSection[]>("/admin/sections", undefined, token);
}

export function createAdminSection(
  payload: { code: string; name: string; description?: string | null },
  token?: string
): Promise<LmsSection> {
  return request<LmsSection>(
    "/admin/sections",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function updateAdminSection(
  sectionId: number,
  payload: { name?: string; description?: string | null; status?: "active" | "archived" },
  token?: string
): Promise<LmsSection> {
  return request<LmsSection>(
    `/admin/sections/${sectionId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function assignSectionMembers(
  sectionId: number,
  payload: { teacher_ids?: number[]; student_ids?: number[] },
  token?: string
): Promise<LmsSection> {
  return request<LmsSection>(
    `/admin/sections/${sectionId}/assignments`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function getPendingCertificateTemplates(token?: string): Promise<CertificateTemplateSummary[]> {
  return request<CertificateTemplateSummary[]>("/admin/certificates/pending", undefined, token);
}

export function reviewCertificateTemplate(
  templateId: number,
  action: "approve" | "reject",
  remarks: string,
  token?: string
): Promise<CertificateTemplateSummary> {
  return request<CertificateTemplateSummary>(
    `/admin/certificates/${templateId}/${action}`,
    {
      method: "POST",
      body: JSON.stringify({ remarks }),
    },
    token
  );
}

export function getAdminLoginActivityReport(limit = 100, token?: string): Promise<LoginActivityReport> {
  const query = buildQuery({ limit });
  return request<LoginActivityReport>(`/admin/reports/login-activity${query}`, undefined, token);
}

export function getAdminAuditEvents(limit = 100, token?: string): Promise<AdminAuditEvent[]> {
  const query = buildQuery({ limit });
  return request<AdminAuditEvent[]>(`/admin/reports/admin-actions${query}`, undefined, token);
}

export function getAdminSystemActivityEvents(
  limit = 150,
  role: "all" | "student" | "teacher" | "admin" = "all",
  token?: string
): Promise<SystemActivityEvent[]> {
  const query = buildQuery({ limit, role });
  return request<SystemActivityEvent[]>(`/admin/reports/system-activity${query}`, undefined, token);
}

export function getTeacherDashboard(token?: string): Promise<TeacherSectionSummary[]> {
  return request<TeacherSectionSummary[]>("/teacher/dashboard", undefined, token);
}

export function getTeacherSections(token?: string): Promise<TeacherSectionSummary[]> {
  return request<TeacherSectionSummary[]>("/teacher/sections", undefined, token);
}

export function getTeacherSection(sectionId: number, token?: string): Promise<LmsSection> {
  return request<LmsSection>(`/teacher/sections/${sectionId}`, undefined, token);
}

export function getTeacherSectionModules(
  sectionId: number,
  token?: string
): Promise<TeacherSectionModule[]> {
  return request<TeacherSectionModule[]>(`/teacher/sections/${sectionId}/modules`, undefined, token);
}

export function createTeacherSectionModule(
  sectionId: number,
  payload: { title: string; description?: string },
  token?: string
): Promise<TeacherSectionModule> {
  return request<TeacherSectionModule>(
    `/teacher/sections/${sectionId}/modules`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function updateTeacherModule(
  moduleId: number,
  payload: { title?: string; description?: string; is_published?: boolean; order_index?: number },
  token?: string
): Promise<TeacherSectionModule> {
  return request<TeacherSectionModule>(
    `/teacher/modules/${moduleId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function createTeacherModuleItem(
  moduleId: number,
  payload: {
    title: string;
    item_type: LmsModuleItemType;
    instructions?: string | null;
    content_text?: string | null;
    config?: Record<string, unknown>;
    is_required?: boolean;
    is_published?: boolean;
  },
  token?: string
): Promise<TeacherSectionModule> {
  return request<TeacherSectionModule>(
    `/teacher/modules/${moduleId}/items`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function uploadTeacherModuleItemResource(
  moduleId: number,
  payload: {
    title: string;
    item_type: "video_resource" | "document_resource" | "interactive_resource";
    file: File;
    instructions?: string;
    content_text?: string;
    is_required?: boolean;
    is_published?: boolean;
  },
  token?: string
): Promise<TeacherSectionModule> {
  const data = new FormData();
  data.append("title", payload.title);
  data.append("item_type", payload.item_type);
  data.append("resource_file", payload.file);
  if (payload.instructions) {
    data.append("instructions", payload.instructions);
  }
  if (payload.content_text) {
    data.append("content_text", payload.content_text);
  }
  data.append("is_required", String(payload.is_required ?? true));
  data.append("is_published", String(payload.is_published ?? true));

  return request<TeacherSectionModule>(
    `/teacher/modules/${moduleId}/items/upload`,
    {
      method: "POST",
      body: data,
    },
    token
  );
}

export function uploadTeacherModuleItemAsset(
  itemId: number,
  payload: {
    file: File;
    usage?: "attachment" | "prompt";
    label?: string;
  },
  token?: string
): Promise<TeacherSectionModule> {
  const data = new FormData();
  data.append("resource_file", payload.file);
  data.append("usage", payload.usage ?? "attachment");
  if (payload.label && payload.label.trim()) {
    data.append("label", payload.label.trim());
  }
  return request<TeacherSectionModule>(
    `/teacher/module-items/${itemId}/assets/upload`,
    {
      method: "POST",
      body: data,
    },
    token
  );
}

export function updateTeacherModuleItem(
  itemId: number,
  payload: {
    title?: string;
    instructions?: string | null;
    content_text?: string | null;
    config?: Record<string, unknown>;
    is_required?: boolean;
    is_published?: boolean;
  },
  token?: string
): Promise<TeacherSectionModule> {
  return request<TeacherSectionModule>(
    `/teacher/module-items/${itemId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function deleteTeacherModuleItem(itemId: number, token?: string): Promise<TeacherSectionModule> {
  return request<TeacherSectionModule>(`/teacher/module-items/${itemId}`, { method: "DELETE" }, token);
}

export function uploadTeacherCertificateTemplate(sectionId: number, file: File, token?: string) {
  const data = new FormData();
  data.append("certificate_file", file);
  return request<CertificateTemplateSummary>(
    `/teacher/sections/${sectionId}/certificate-template`,
    {
      method: "POST",
      body: data,
    },
    token
  );
}

export function getTeacherCertificateTemplates(token?: string) {
  return request<CertificateTemplateSummary[]>("/teacher/certificates", undefined, token);
}

export function getTeacherStudentProgressReport(studentId: number, token?: string) {
  return request<TeacherStudentProgressReport>(`/teacher/students/${studentId}/report`, undefined, token);
}

export function getStudentDashboard(token?: string): Promise<StudentCourse> {
  return request<StudentCourse>("/student/dashboard", undefined, token);
}

export function getStudentCourse(token?: string): Promise<StudentCourse> {
  return request<StudentCourse>("/student/course", undefined, token);
}

export function completeReadableItem(itemId: number, durationSeconds = 0, token?: string) {
  return request<StudentProgressUpdate>(
    `/student/module-items/${itemId}/complete`,
    {
      method: "POST",
      body: JSON.stringify({ duration_seconds: durationSeconds }),
    },
    token
  );
}

export function submitStudentItem(
  itemId: number,
  payload: { response_text: string; duration_seconds?: number; score_percent?: number | null; extra_payload?: Record<string, unknown> },
  token?: string
) {
  return request<StudentProgressUpdate>(
    `/student/module-items/${itemId}/submit`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function getStudentCertificateDownloadStatus(token?: string) {
  return request<StudentCertificateDownloadStatus>("/student/certificate", undefined, token);
}

export function getStudentCertificateStatus(
  token?: string
): Promise<StudentCertificateStatus> {
  return request<StudentCertificateStatus>("/modules/certificate-status", undefined, token);
}

export function downloadStudentCertificate(token?: string) {
  return requestBlob("/student/certificate/download", undefined, token);
}

export function updateMyProfile(payload: ProfileUpdatePayload): Promise<ApiUser> {
  return request<ApiUser>("/auth/me/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function changeMyPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  return request<{ message: string }>("/auth/me/change-password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

export function confirmForgotPasswordOtp(
  usernameOrEmail: string,
  otpCode: string
): Promise<ForgotPasswordConfirmOtpResponse> {
  return request<ForgotPasswordConfirmOtpResponse>("/auth/forgot-password/confirm-otp", {
    method: "POST",
    body: JSON.stringify({
      username_or_email: usernameOrEmail,
      otp_code: otpCode,
    }),
  });
}

export function resetForgotPassword(
  resetToken: string,
  newPassword: string
): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/forgot-password/reset", {
    method: "POST",
    body: JSON.stringify({
      reset_token: resetToken,
      new_password: newPassword,
    }),
  });
}

export function unenrollMyAccount(): Promise<{ message: string }> {
  return request<{ message: string }>("/auth/me/unenroll", {
    method: "POST",
  });
}

export function uploadMyProfilePhoto(file: File): Promise<ApiUser> {
  const data = new FormData();
  data.append("profile_photo", file);
  return request<ApiUser>("/auth/me/profile-photo", {
    method: "POST",
    body: data,
  });
}

export async function submitRegistration(
  payload: RegistrationPayload
): Promise<RegistrationSubmitResponse> {
  const data = new FormData();
  data.append("first_name", payload.first_name);
  data.append("last_name", payload.last_name);
  data.append("email", payload.email);
  data.append("phone_number", payload.phone_number);
  data.append("reference_number", payload.reference_number);

  if (payload.middle_name?.trim()) {
    data.append("middle_name", payload.middle_name.trim());
  }
  data.append("birth_date", payload.birth_date.trim());
  data.append("address", payload.address.trim());
  data.append("reference_image", payload.reference_image);

  return request<RegistrationSubmitResponse>("/registrations", {
    method: "POST",
    body: data,
  });
}

export function getProgressSummary(token?: string): Promise<ProgressSummary> {
  return request<ProgressSummary>("/progress/summary", undefined, token);
}

export function getModules(token?: string): Promise<ModuleItem[]> {
  return request<ModuleItem[]>("/modules", undefined, token);
}

export function getModule(moduleId: number, token?: string): Promise<ModuleItem> {
  return request<ModuleItem>(`/modules/${moduleId}`, undefined, token);
}

export function submitActivityAttempt(
  moduleId: number,
  activityKey: string | number,
  payload: ActivityAttemptPayload,
  token?: string
): Promise<ActivityAttemptResponse> {
  return request<ActivityAttemptResponse>(
    `/modules/${moduleId}/activities/${activityKey}/attempts`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function getTeacherAssessmentReports(
  token?: string
): Promise<TeacherAssessmentReport[]> {
  const data = await request<TeacherAssessmentReportsResponse>(
    "/teacher/reports",
    undefined,
    token
  );
  return data.reports;
}

export async function getTeacherStudentReportRows(
  token?: string
): Promise<TeacherStudentReportRow[]> {
  const data = await request<TeacherStudentReportTableResponse>(
    "/teacher/reports/students",
    undefined,
    token
  );
  return data.students;
}

export function generateTeacherStudentReport(
  studentId: number,
  token?: string
): Promise<TeacherGeneratedStudentReport> {
  return request<TeacherGeneratedStudentReport>(
    `/teacher/reports/students/${studentId}/generate`,
    {
      method: "POST",
    },
    token
  );
}

export function getTeacherReportSummary(
  filters?: {
    batchId?: number | null;
    moduleId?: number | null;
    includeArchivedBatches?: boolean;
  },
  token?: string
): Promise<TeacherReportSummary> {
  const query = buildQuery({
    batch_id: filters?.batchId,
    module_id: filters?.moduleId,
    include_archived_batches: filters?.includeArchivedBatches,
  });
  return request<TeacherReportSummary>(`/teacher/reports/summary${query}`, undefined, token);
}

export function getTeacherReportBreakdown(
  filters?: {
    batchId?: number | null;
    moduleId?: number | null;
    includeArchivedBatches?: boolean;
  },
  token?: string
): Promise<TeacherReportBreakdownResponse> {
  const query = buildQuery({
    batch_id: filters?.batchId,
    module_id: filters?.moduleId,
    include_archived_batches: filters?.includeArchivedBatches,
  });
  return request<TeacherReportBreakdownResponse>(
    `/teacher/reports/breakdown${query}`,
    undefined,
    token
  );
}

export function getTeacherEnrollments(
  filters?: { status?: string | null; batchId?: number | null },
  token?: string
): Promise<TeacherEnrollment[]> {
  const query = buildQuery({
    status: filters?.status,
    batch_id: filters?.batchId,
  });
  return request<TeacherEnrollment[]>(`/teacher/enrollments${query}`, undefined, token);
}

export function getTeacherEnrollment(
  enrollmentId: number,
  token?: string
): Promise<TeacherEnrollment> {
  return request<TeacherEnrollment>(`/teacher/enrollments/${enrollmentId}`, undefined, token);
}

export function getTeacherEnrollmentPaymentProof(
  enrollmentId: number,
  token?: string
): Promise<Blob> {
  return requestBlob(`/teacher/enrollments/${enrollmentId}/payment-proof`, undefined, token);
}

export function approveTeacherEnrollment(
  enrollmentId: number,
  payload: TeacherEnrollmentApprovePayload,
  token?: string
): Promise<TeacherEnrollmentApprovalResult> {
  return request<TeacherEnrollmentApprovalResult>(
    `/teacher/enrollments/${enrollmentId}/approve`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function rejectTeacherEnrollment(
  enrollmentId: number,
  payload: TeacherEnrollmentRejectPayload,
  token?: string
): Promise<TeacherEnrollmentRejectionResult> {
  return request<TeacherEnrollmentRejectionResult>(
    `/teacher/enrollments/${enrollmentId}/reject`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function assignTeacherEnrollmentBatch(
  enrollmentId: number,
  payload: TeacherEnrollmentAssignBatchPayload,
  token?: string
): Promise<TeacherEnrollment> {
  return request<TeacherEnrollment>(
    `/teacher/enrollments/${enrollmentId}/assign-batch`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function requestTeacherEnrollmentManagement(
  enrollmentId: number,
  payload: TeacherEnrollmentRequestManagementPayload,
  token?: string
): Promise<TeacherEnrollment> {
  return request<TeacherEnrollment>(
    `/teacher/enrollments/${enrollmentId}/request-management`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function approveTeacherEnrollmentManagementRequest(
  enrollmentId: number,
  payload: TeacherEnrollmentApproveManagementPayload,
  token?: string
): Promise<TeacherEnrollment> {
  return request<TeacherEnrollment>(
    `/teacher/enrollments/${enrollmentId}/request-management/approve`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function rejectTeacherEnrollmentManagementRequest(
  enrollmentId: number,
  payload: TeacherEnrollmentRejectManagementPayload,
  token?: string
): Promise<TeacherEnrollment> {
  return request<TeacherEnrollment>(
    `/teacher/enrollments/${enrollmentId}/request-management/reject`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function getTeacherBatches(
  filters?: { status?: "active" | "archived" | "all" },
  token?: string
): Promise<TeacherBatch[]> {
  const query = buildQuery({
    status: filters?.status,
  });
  return request<TeacherBatch[]>(`/teacher/batches${query}`, undefined, token);
}

export function createTeacherBatch(
  payload: TeacherBatchCreatePayload,
  token?: string
): Promise<TeacherBatch> {
  return request<TeacherBatch>(
    "/teacher/batches",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function getAdminTeachers(token?: string): Promise<TeacherUserSummary[]> {
  return request<TeacherUserSummary[]>("/teacher/teachers", undefined, token);
}

export function assignTeacherToBatch(
  batchId: number,
  payload: TeacherBatchAssignTeacherPayload,
  token?: string
): Promise<TeacherBatch> {
  return request<TeacherBatch>(
    `/teacher/batches/${batchId}/assign-teacher`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function getTeacherBatchStudents(
  batchId: number,
  token?: string
): Promise<TeacherUserSummary[]> {
  return request<TeacherUserSummary[]>(`/teacher/batches/${batchId}/students`, undefined, token);
}

export function archiveTeacherBatch(batchId: number, token?: string): Promise<TeacherBatch> {
  return request<TeacherBatch>(
    `/teacher/batches/${batchId}/archive`,
    {
      method: "POST",
    },
    token
  );
}

export function restoreTeacherBatch(batchId: number, token?: string): Promise<TeacherBatch> {
  return request<TeacherBatch>(
    `/teacher/batches/${batchId}/restore`,
    {
      method: "POST",
    },
    token
  );
}

export function getTeacherModulesCatalog(token?: string): Promise<TeacherModulesCatalog> {
  return request<TeacherModulesCatalog>("/teacher/modules", undefined, token);
}

export function createTeacherModule(
  payload: TeacherModuleCreatePayload,
  token?: string
): Promise<TeacherModuleCard> {
  return request<TeacherModuleCard>(
    "/teacher/modules",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function updateTeacherLegacyModule(
  moduleId: number,
  payload: TeacherModuleUpdatePayload,
  token?: string
): Promise<TeacherModuleCard> {
  return request<TeacherModuleCard>(
    `/teacher/modules/${moduleId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function copyTeacherModule(moduleId: number, token?: string): Promise<TeacherModuleCard> {
  return request<TeacherModuleCard>(
    `/teacher/modules/${moduleId}/copy`,
    {
      method: "POST",
    },
    token
  );
}

export function archiveTeacherModule(moduleId: number, token?: string): Promise<TeacherModuleCard> {
  return request<TeacherModuleCard>(
    `/teacher/modules/${moduleId}/archive`,
    {
      method: "POST",
    },
    token
  );
}

export function restoreTeacherModule(moduleId: number, token?: string): Promise<TeacherModuleCard> {
  return request<TeacherModuleCard>(
    `/teacher/modules/${moduleId}/restore`,
    {
      method: "POST",
    },
    token
  );
}

export function uploadTeacherModuleCover(
  moduleId: number,
  coverImage: File,
  token?: string
): Promise<TeacherModuleCard> {
  const form = new FormData();
  form.append("cover_image", coverImage);
  return request<TeacherModuleCard>(
    `/teacher/modules/${moduleId}/cover`,
    {
      method: "POST",
      body: form,
    },
    token
  );
}

export function getTeacherPresence(token?: string): Promise<TeacherPresence> {
  return request<TeacherPresence>("/teacher/presence", undefined, token);
}

export function updateTeacherPresence(
  payload: TeacherPresenceUpdatePayload,
  token?: string
): Promise<TeacherPresence> {
  return request<TeacherPresence>(
    "/teacher/presence",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function getTeacherActiveSession(
  token?: string
): Promise<TeacherHandlingSession | null> {
  return request<TeacherHandlingSession | null>("/teacher/sessions/active", undefined, token);
}

export function startTeacherHandlingSession(
  payload: TeacherHandlingSessionCreatePayload,
  token?: string
): Promise<TeacherHandlingSession> {
  return request<TeacherHandlingSession>(
    "/teacher/sessions",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function endTeacherHandlingSession(
  sessionId: number,
  token?: string
): Promise<TeacherHandlingSession> {
  return request<TeacherHandlingSession>(
    `/teacher/sessions/${sessionId}/end`,
    {
      method: "POST",
    },
    token
  );
}

export function getTeacherStudent(studentId: number, token?: string): Promise<TeacherStudent> {
  return request<TeacherStudent>(`/teacher/students/${studentId}`, undefined, token);
}

export function getTeacherStudentActivityAttempts(
  studentId: number,
  token?: string
): Promise<TeacherActivityAttempt[]> {
  return request<TeacherActivityAttempt[]>(
    `/teacher/students/${studentId}/activity-attempts`,
    undefined,
    token
  );
}

export function getTeacherStudentCertificate(
  studentId: number,
  token?: string
): Promise<TeacherStudentCertificate> {
  return request<TeacherStudentCertificate>(
    `/teacher/students/${studentId}/certificate`,
    undefined,
    token
  );
}

export function decideTeacherStudentCertificate(
  studentId: number,
  payload: TeacherStudentCertificateDecisionPayload,
  token?: string
): Promise<TeacherStudentCertificate> {
  return request<TeacherStudentCertificate>(
    `/teacher/students/${studentId}/certificate/decision`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function getTeacherCertificateHistory(
  filters?: { status?: "issued" | "all" },
  token?: string
): Promise<TeacherCertificateHistoryItem[]> {
  const query = buildQuery({
    status: filters?.status,
  });
  return request<TeacherCertificateHistoryItem[]>(`/teacher/certificates${query}`, undefined, token);
}

export function getTeacherActivityAttempt(
  attemptId: number,
  token?: string
): Promise<TeacherActivityAttempt> {
  return request<TeacherActivityAttempt>(`/teacher/activity-attempts/${attemptId}`, undefined, token);
}

export function updateModuleProgress(
  moduleId: number,
  payload: {
    completed_lesson_id?: string;
    assessment_id?: string;
    assessment_score?: number;
    assessment_right?: number;
    assessment_wrong?: number;
    assessment_total?: number;
    assessment_title?: string;
    improvement_areas?: string[];
    mark_completed?: boolean;
  },
  token?: string
): Promise<ModuleItem> {
  return request<ModuleItem>(
    `/modules/${moduleId}/progress`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function getTeacherReportStudents(token?: string): Promise<TeacherStudentReportTableResponse> {
  return request<TeacherStudentReportTableResponse>("/teacher/reports/students", undefined, token);
}

export function predictSign(
  payload: { frame_count: number; metadata?: Record<string, string> },
  token?: string
): Promise<LabPrediction> {
  return request<LabPrediction>(
    "/lab/predict",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function predictSignFromImage(
  file: File,
  mode: RecognitionMode = "alphabet",
  token?: string
): Promise<LabPrediction> {
  const data = new FormData();
  data.append("image", file);
  data.append("mode", mode);

  return request<LabPrediction>(
    "/lab/predict-image",
    {
      method: "POST",
      body: data,
    },
    token
  );
}

export function detectOpenPalmFromImage(file: File, token?: string): Promise<OpenPalmDetection> {
  const data = new FormData();
  data.append("image", file);

  return request<OpenPalmDetection>(
    "/lab/detect-open-palm",
    {
      method: "POST",
      body: data,
    },
    token
  );
}

export function predictWordsFromFrames(
  frames: File[],
  token?: string,
  wordGroup: WordsCategory = "greeting"
): Promise<LabPrediction> {
  const data = new FormData();
  for (const frame of frames) {
    data.append("frames", frame);
  }
  data.append("word_group", wordGroup);

  return request<LabPrediction>(
    "/lab/predict-words-sequence",
    {
      method: "POST",
      body: data,
    },
    token
  );
}

export function predictNumbersFromFrames(
  frames: File[],
  token?: string,
  numberGroup: NumbersCategory = "0-10"
): Promise<LabPrediction> {
  const data = new FormData();
  for (const frame of frames) {
    data.append("frames", frame);
  }
  data.append("number_group", numberGroup);

  return request<LabPrediction>(
    "/lab/predict-numbers-sequence",
    {
      method: "POST",
      body: data,
    },
    token
  );
}

export function getAlphabetDatasetStatus(token?: string): Promise<AlphabetDatasetStatus> {
  return request<AlphabetDatasetStatus>("/lab/alphabet-dataset", undefined, token);
}

export function getAlphabetModelStatus(token?: string): Promise<AlphabetModelStatus> {
  return request<AlphabetModelStatus>("/lab/alphabet-model", undefined, token);
}

export function getNumbersDatasetStatus(token?: string): Promise<NumbersDatasetStatus> {
  return request<NumbersDatasetStatus>("/lab/numbers-dataset", undefined, token);
}

export function getNumbersModelStatus(token?: string): Promise<NumbersModelStatus> {
  return request<NumbersModelStatus>("/lab/numbers-model", undefined, token);
}

export function getWordsDatasetStatus(token?: string): Promise<WordsDatasetStatus> {
  return request<WordsDatasetStatus>("/lab/words-dataset", undefined, token);
}

export function getWordsModelStatus(token?: string): Promise<WordsModelStatus> {
  return request<WordsModelStatus>("/lab/words-model", undefined, token);
}
