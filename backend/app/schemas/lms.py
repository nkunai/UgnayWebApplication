from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ModuleItemType = Literal[
    "readable",
    "video_resource",
    "document_resource",
    "interactive_resource",
    "external_link_resource",
    "multiple_choice_assessment",
    "identification_assessment",
    "signing_lab_assessment",
]


class UserSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: Literal["student", "teacher", "admin"]
    first_name: str | None = None
    last_name: str | None = None
    company_name: str | None = None
    email: str | None = None


class AdminUserOut(UserSummaryOut):
    must_change_password: bool = False
    created_at: datetime
    archived_at: datetime | None = None


class RecentAccountOut(UserSummaryOut):
    created_at: datetime


class AdminDashboardOut(BaseModel):
    total_students: int
    total_teachers: int
    total_sections: int
    active_sections: int
    pending_certificate_approvals: int
    recent_accounts: list[RecentAccountOut] = Field(default_factory=list)


class BulkAccountCreateRow(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    company_name: str | None = Field(default=None, max_length=200)
    section_id: int | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class BulkAccountImportRequest(BaseModel):
    role: Literal["student", "teacher"]
    batch_size: int = Field(default=25, ge=1, le=100)
    accounts: list[BulkAccountCreateRow] = Field(min_length=1)


class BulkAccountResultOut(BaseModel):
    email: str
    username: str
    temporary_password: str
    delivery_status: Literal["sent", "skipped"]
    section_id: int | None = None


class BulkAccountImportJobOut(BaseModel):
    processed_count: int
    sent_count: int
    skipped_count: int
    results: list[BulkAccountResultOut] = Field(default_factory=list)


class SectionCreateRequest(BaseModel):
    code: str = Field(min_length=2, max_length=60)
    name: str = Field(min_length=2, max_length=160)
    description: str | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class SectionUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = None
    status: Literal["active", "archived"] | None = None


class SectionAssignmentRequest(BaseModel):
    teacher_ids: list[int] = Field(default_factory=list)
    student_ids: list[int] = Field(default_factory=list)


class SectionMemberOut(UserSummaryOut):
    assigned_at: datetime | None = None
    course_completed_at: datetime | None = None
    auto_archive_due_at: datetime | None = None


class SectionOut(BaseModel):
    id: int
    code: str
    name: str
    description: str | None = None
    status: str
    teacher_count: int = 0
    student_count: int = 0
    teachers: list[SectionMemberOut] = Field(default_factory=list)
    students: list[SectionMemberOut] = Field(default_factory=list)


class ModuleItemChoiceConfig(BaseModel):
    question: str | None = None
    choices: list[str] = Field(default_factory=list)
    correct_answer: str | None = None
    accepted_answers: list[str] = Field(default_factory=list)
    expected_answer: str | None = None
    helper_text: str | None = None
    presentation_mode: Literal["cards", "slideshow"] | None = None
    lab_mode: Literal["alphabet", "numbers", "words"] | None = None
    numbers_category: Literal[
        "0-10",
        "11-20",
        "21-30",
        "31-40",
        "41-50",
        "51-60",
        "61-70",
        "71-80",
        "81-90",
        "91-100",
    ] | None = None
    words_category: Literal[
        "greeting",
        "responses",
        "date",
        "family",
        "relationship",
        "color",
    ] | None = None
    resource_url: str | None = None
    resource_file_name: str | None = None
    resource_file_path: str | None = None
    resource_mime_type: str | None = None
    resource_kind: Literal["video", "image", "document", "interactive", "external_link"] | None = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    prompt_media: dict[str, Any] | None = None


class ModuleItemCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    item_type: ModuleItemType
    instructions: str | None = None
    content_text: str | None = None
    config: ModuleItemChoiceConfig = Field(default_factory=ModuleItemChoiceConfig)
    is_required: bool = True
    is_published: bool = True


class ModuleItemUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    instructions: str | None = None
    content_text: str | None = None
    config: ModuleItemChoiceConfig | None = None
    is_required: bool | None = None
    is_published: bool | None = None


class TeacherSectionModuleCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""


class TeacherSectionModuleUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    is_published: bool | None = None
    order_index: int | None = Field(default=None, ge=1, le=12)


class SectionModuleItemOut(BaseModel):
    id: int
    title: str
    item_type: ModuleItemType
    order_index: int
    instructions: str | None = None
    content_text: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    is_required: bool = True
    is_published: bool = True


class TeacherSectionModuleOut(BaseModel):
    id: int
    section_id: int
    title: str
    description: str
    order_index: int
    is_published: bool
    items: list[SectionModuleItemOut] = Field(default_factory=list)


class TeacherSectionSummaryOut(BaseModel):
    section: SectionOut
    draft_module_count: int = 0
    published_module_count: int = 0
    pending_certificate_status: str | None = None


class StudentModuleCardOut(BaseModel):
    id: int
    title: str
    description: str
    order_index: int
    is_locked: bool
    progress_percent: int
    status: str


class StudentModuleItemOut(BaseModel):
    id: int
    title: str
    item_type: ModuleItemType
    order_index: int
    instructions: str | None = None
    content_text: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    is_locked: bool
    status: str
    attempt_count: int
    response_text: str | None = None
    score_percent: float | None = None
    is_correct: bool | None = None


class StudentCourseModuleOut(BaseModel):
    id: int
    title: str
    description: str
    order_index: int
    is_locked: bool
    status: str
    progress_percent: int
    items: list[StudentModuleItemOut] = Field(default_factory=list)


class StudentCourseOut(BaseModel):
    section: SectionOut | None = None
    modules: list[StudentCourseModuleOut] = Field(default_factory=list)


class StudentReadableCompletionRequest(BaseModel):
    duration_seconds: int = Field(default=0, ge=0)


class StudentAssessmentSubmissionRequest(BaseModel):
    response_text: str = Field(min_length=1, max_length=500)
    duration_seconds: int = Field(default=0, ge=0)
    score_percent: float | None = Field(default=None, ge=0, le=100)
    extra_payload: dict[str, Any] = Field(default_factory=dict)


class StudentProgressUpdateOut(BaseModel):
    module_id: int
    item_id: int
    module_status: str
    module_progress_percent: int
    item_status: str
    is_correct: bool | None = None
    score_percent: float | None = None


class TeacherStudentItemReportOut(BaseModel):
    item_id: int
    item_title: str
    item_type: ModuleItemType
    order_index: int
    status: str
    is_correct: bool | None = None
    score_percent: float | None = None
    attempt_count: int
    duration_seconds: int
    completed_at: datetime | None = None


class TeacherStudentModuleReportOut(BaseModel):
    module_id: int
    module_title: str
    status: str
    progress_percent: int
    correct_count: int
    wrong_count: int
    attempt_count: int
    total_duration_seconds: int
    item_reports: list[TeacherStudentItemReportOut] = Field(default_factory=list)


class TeacherStudentReportOut(BaseModel):
    student: UserSummaryOut
    section: SectionOut | None = None
    current_finished_module: str | None = None
    verdict: str
    module_reports: list[TeacherStudentModuleReportOut] = Field(default_factory=list)


class CertificateTemplateOut(BaseModel):
    id: int
    section_id: int
    section_name: str
    original_file_name: str
    status: str
    review_remarks: str | None = None
    created_at: datetime


class CertificateReviewRequest(BaseModel):
    remarks: str | None = None


class CertificateStudentDownloadOut(BaseModel):
    eligible: bool
    template_id: int | None = None
    section_name: str | None = None
    message: str


class LoginActivityEventOut(BaseModel):
    session_id: int
    user_id: int
    username: str
    role: Literal["student", "teacher", "admin"]
    logged_in_at: datetime
    expires_at: datetime
    is_active: bool


class LoginActivitySummaryOut(BaseModel):
    total_logins_last_24h: int
    active_sessions: int
    logins_last_24h_by_role: dict[str, int] = Field(default_factory=dict)
    events: list[LoginActivityEventOut] = Field(default_factory=list)


class AdminAuditEventOut(BaseModel):
    id: int
    admin_user_id: int
    admin_username: str
    action_type: str
    target_type: str
    target_id: int | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class SystemActivityEventOut(BaseModel):
    id: int
    actor_user_id: int
    actor_username: str
    actor_role: Literal["student", "teacher", "admin"]
    actor_email: str | None = None
    actor_first_name: str | None = None
    actor_last_name: str | None = None
    actor_company_name: str | None = None
    action_type: str
    target_type: str
    target_id: int | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class UploadedModuleAssetOut(BaseModel):
    resource_kind: Literal["video", "image", "document", "interactive"]
    resource_file_name: str
    resource_file_path: str
    resource_mime_type: str | None = None
    resource_url: str | None = None
    label: str | None = None
