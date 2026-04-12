from datetime import timedelta
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_admin
from app.core.datetime_utils import as_utc, utc_now
from app.core.security import hash_password
from app.db.session import get_db
from app.models.admin_audit_log import AdminAuditLog
from app.models.certificate import CertificateTemplate
from app.models.session import UserSession
from app.models.section import Section, SectionStudentAssignment, SectionTeacherAssignment
from app.models.user import User
from app.schemas.lms import (
    AdminAuditEventOut,
    AdminDashboardOut,
    AdminUserOut,
    BulkAccountImportJobOut,
    BulkAccountImportRequest,
    BulkAccountResultOut,
    CertificateReviewRequest,
    CertificateTemplateOut,
    LoginActivityEventOut,
    LoginActivitySummaryOut,
    RecentAccountOut,
    SectionAssignmentRequest,
    SectionCreateRequest,
    SectionOut,
    SectionUpdateRequest,
    SystemActivityEventOut,
)
from app.services.email_sender import (
    send_student_initial_credentials_email,
    send_teacher_initial_credentials_email,
)
from app.services.lms_service import (
    auto_archive_due_students,
    assign_student_to_section,
    build_unique_username,
    count_users_by_role,
    section_out,
    user_summary,
    generate_temporary_password,
)


router = APIRouter(prefix="/admin", tags=["admin-lms"])


CERTIFICATE_TEMPLATES_DIR = (
    Path(__file__).resolve().parents[3] / "uploads" / "certificate-templates"
).resolve()
CERTIFICATE_TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)


def _log_admin_action(
    db: Session,
    *,
    admin_id: int,
    action_type: str,
    target_type: str,
    target_id: int | None,
    details: dict,
) -> None:
    db.add(
        AdminAuditLog(
            admin_user_id=admin_id,
            action_type=action_type,
            target_type=target_type,
            target_id=target_id,
            details=details,
        )
    )


def _send_initial_credentials(email: str, username: str, temporary_password: str, role: str) -> str:
    try:
        if role == "teacher":
            send_teacher_initial_credentials_email(
                to_email=email,
                username=username,
                temporary_password=temporary_password,
            )
        else:
            send_student_initial_credentials_email(
                to_email=email,
                username=username,
                temporary_password=temporary_password,
                batch_name=None,
            )
        return "sent"
    except RuntimeError:
        return "skipped"


@router.get("/dashboard", response_model=AdminDashboardOut)
def get_admin_dashboard(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> AdminDashboardOut:
    auto_archive_due_students(db)
    db.commit()
    sections = db.query(Section).count()
    active_sections = db.query(Section).filter(Section.status == "active").count()
    pending_certificates = 0
    recent_users = (
        db.query(User)
        .filter(User.archived_at.is_(None))
        .order_by(User.created_at.desc(), User.id.desc())
        .limit(5)
        .all()
    )
    return AdminDashboardOut(
        total_students=count_users_by_role(db, "student"),
        total_teachers=count_users_by_role(db, "teacher"),
        total_sections=sections,
        active_sections=active_sections,
        pending_certificate_approvals=pending_certificates,
        recent_accounts=[
            RecentAccountOut(**user_summary(user).model_dump(), created_at=user.created_at)
            for user in recent_users
        ],
    )


@router.get("/users", response_model=list[AdminUserOut])
def list_users_for_admin(
    role: str | None = None,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> list[AdminUserOut]:
    auto_archive_due_students(db)
    db.commit()
    query = db.query(User).order_by(User.created_at.desc())
    if not include_archived:
        query = query.filter(User.archived_at.is_(None))
    if role in {"student", "teacher", "admin"}:
        query = query.filter(User.role == role)
    return [
        AdminUserOut(
            **user_summary(user).model_dump(),
            must_change_password=user.must_change_password,
            created_at=user.created_at,
            archived_at=user.archived_at,
        )
        for user in query.all()
    ]


@router.post("/accounts/import", response_model=BulkAccountImportJobOut)
def bulk_import_accounts(
    payload: BulkAccountImportRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> BulkAccountImportJobOut:
    auto_archive_due_students(db)
    results: list[BulkAccountResultOut] = []
    sent_count = 0
    skipped_count = 0

    normalized_emails = [row.email.strip().lower() for row in payload.accounts]
    seen: set[str] = set()
    duplicate_emails: set[str] = set()
    for email in normalized_emails:
        if email in seen:
            duplicate_emails.add(email)
        seen.add(email)
    if duplicate_emails:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Duplicate emails found in import: {', '.join(sorted(duplicate_emails))}",
        )

    existing_users = db.query(User).filter(User.email.in_(normalized_emails)).all()
    if existing_users:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Some emails already exist in the system.",
        )
    if payload.role == "student":
        requested_section_ids = sorted(
            {
                int(row.section_id)
                for row in payload.accounts
                if row.section_id is not None
            }
        )
        if requested_section_ids:
            existing_sections = {
                section.id
                for section in db.query(Section).filter(Section.id.in_(requested_section_ids)).all()
            }
            missing = [section_id for section_id in requested_section_ids if section_id not in existing_sections]
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Section not found: {', '.join(str(value) for value in missing)}",
                )

    for index, row in enumerate(payload.accounts, start=1):
        existing = db.query(User).filter(User.email == row.email).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Email already exists: {row.email}",
            )

        username = build_unique_username(db, row.email, payload.role)
        temporary_password = generate_temporary_password()
        user = User(
            username=username,
            email=row.email,
            first_name=row.first_name.strip() if row.first_name else None,
            last_name=row.last_name.strip() if row.last_name else None,
            company_name=row.company_name.strip() if row.company_name else None,
            password_hash=hash_password(temporary_password),
            role=payload.role,
            must_change_password=True,
        )
        db.add(user)
        db.flush()

        if payload.role == "student" and row.section_id is not None:
            assign_student_to_section(db, student_id=user.id, section_id=row.section_id)

        delivery_status = _send_initial_credentials(row.email, username, temporary_password, payload.role)
        if delivery_status == "sent":
            sent_count += 1
        else:
            skipped_count += 1

        _log_admin_action(
            db,
            admin_id=current_admin.id,
            action_type="account_imported",
            target_type="user",
            target_id=user.id,
            details={
                "email": row.email,
                "role": payload.role,
                "company_name": row.company_name,
                "section_id": row.section_id,
                "batch_index": ((index - 1) // payload.batch_size) + 1,
            },
        )
        results.append(
            BulkAccountResultOut(
                email=row.email,
                username=username,
                temporary_password=temporary_password,
                delivery_status=delivery_status,
                section_id=row.section_id,
            )
        )
        if index % payload.batch_size == 0:
            db.commit()

    db.commit()
    return BulkAccountImportJobOut(
        processed_count=len(results),
        sent_count=sent_count,
        skipped_count=skipped_count,
        results=results,
    )


@router.post("/users/{user_id}/resend-credentials")
def resend_credentials(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> dict[str, str]:
    user = db.query(User).filter(User.id == user_id, User.archived_at.is_(None)).first()
    if not user or not user.email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    temporary_password = generate_temporary_password()
    user.password_hash = hash_password(temporary_password)
    user.must_change_password = True
    db.add(user)
    db.flush()

    delivery_status = _send_initial_credentials(user.email, user.username, temporary_password, user.role)
    _log_admin_action(
        db,
        admin_id=current_admin.id,
        action_type="credentials_resent",
        target_type="user",
        target_id=user.id,
        details={"delivery_status": delivery_status},
    )
    db.commit()
    return {
        "message": "Credentials updated.",
        "delivery_status": delivery_status,
        "temporary_password": temporary_password,
    }


@router.post("/users/{user_id}/deactivate")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> dict[str, str]:
    user = db.query(User).filter(User.id == user_id, User.archived_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user.archived_at = utc_now()
    db.add(user)
    _log_admin_action(
        db,
        admin_id=current_admin.id,
        action_type="user_deactivated",
        target_type="user",
        target_id=user.id,
        details={"username": user.username},
    )
    db.commit()
    return {"message": "Account deactivated."}


@router.post("/users/{user_id}/reactivate")
def reactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> dict[str, str]:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user.archived_at = None
    db.add(user)
    _log_admin_action(
        db,
        admin_id=current_admin.id,
        action_type="user_reactivated",
        target_type="user",
        target_id=user.id,
        details={"username": user.username},
    )
    db.commit()
    return {"message": "Account reactivated."}


@router.post("/teachers/{teacher_id}/archive")
def archive_teacher_account(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> dict[str, str]:
    teacher = (
        db.query(User)
        .filter(User.id == teacher_id, User.role == "teacher", User.archived_at.is_(None))
        .first()
    )
    if not teacher:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found.")
    teacher.archived_at = utc_now()
    db.add(teacher)
    db.query(UserSession).filter(UserSession.user_id == teacher.id).delete(synchronize_session=False)
    _log_admin_action(
        db,
        admin_id=current_admin.id,
        action_type="teacher_archived",
        target_type="user",
        target_id=teacher.id,
        details={"username": teacher.username},
    )
    db.commit()
    return {"message": "Teacher account archived."}


@router.post("/students/{student_id}/unarchive")
def unarchive_student_account(
    student_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> dict[str, str]:
    student = db.query(User).filter(User.id == student_id, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")
    if student.archived_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Student account is already active.",
        )
    student.archived_at = None
    db.add(student)
    assignment = (
        db.query(SectionStudentAssignment)
        .filter(SectionStudentAssignment.student_id == student.id)
        .first()
    )
    if assignment and assignment.course_completed_at is not None:
        assignment.auto_archive_due_at = utc_now() + timedelta(days=30)
        db.add(assignment)
    _log_admin_action(
        db,
        admin_id=current_admin.id,
        action_type="student_unarchived",
        target_type="user",
        target_id=student.id,
        details={"username": student.username},
    )
    db.commit()
    return {"message": "Student account restored."}


@router.get("/sections", response_model=list[SectionOut])
def list_sections(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> list[SectionOut]:
    sections = (
        db.query(Section)
        .options(
            joinedload(Section.teachers).joinedload(SectionTeacherAssignment.teacher),
            joinedload(Section.students).joinedload(SectionStudentAssignment.student),
        )
        .order_by(Section.name.asc())
        .all()
    )
    return [section_out(section) for section in sections]


@router.post("/sections", response_model=SectionOut)
def create_section(
    payload: SectionCreateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> SectionOut:
    existing = (
        db.query(Section)
        .filter((Section.code == payload.code) | (Section.name == payload.name))
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Section already exists.")

    section = Section(
        code=payload.code,
        name=payload.name,
        description=payload.description,
        created_by_user_id=current_admin.id,
    )
    db.add(section)
    db.flush()
    _log_admin_action(
        db,
        admin_id=current_admin.id,
        action_type="section_created",
        target_type="section",
        target_id=section.id,
        details={"code": section.code, "name": section.name},
    )
    db.commit()
    db.refresh(section)
    return section_out(section)


@router.patch("/sections/{section_id}", response_model=SectionOut)
def update_section(
    section_id: int,
    payload: SectionUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> SectionOut:
    section = (
        db.query(Section)
        .options(
            joinedload(Section.teachers).joinedload(SectionTeacherAssignment.teacher),
            joinedload(Section.students).joinedload(SectionStudentAssignment.student),
        )
        .filter(Section.id == section_id)
        .first()
    )
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found.")
    if payload.name is not None:
        section.name = payload.name.strip()
    if payload.description is not None:
        section.description = payload.description
    if payload.status is not None:
        section.status = payload.status
    db.add(section)
    _log_admin_action(
        db,
        admin_id=current_admin.id,
        action_type="section_updated",
        target_type="section",
        target_id=section.id,
        details=payload.model_dump(exclude_none=True),
    )
    db.commit()
    db.refresh(section)
    return section_out(section)


@router.post("/sections/{section_id}/assignments", response_model=SectionOut)
def update_section_assignments(
    section_id: int,
    payload: SectionAssignmentRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> SectionOut:
    section = (
        db.query(Section)
        .options(
            joinedload(Section.teachers).joinedload(SectionTeacherAssignment.teacher),
            joinedload(Section.students).joinedload(SectionStudentAssignment.student),
        )
        .filter(Section.id == section_id)
        .first()
    )
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found.")

    for student_id in payload.student_ids:
        student = db.query(User).filter(User.id == student_id, User.role == "student").first()
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Student not found: {student_id}",
            )
        assign_student_to_section(db, student_id=student_id, section_id=section_id)

    _log_admin_action(
        db,
        admin_id=current_admin.id,
        action_type="section_assignments_updated",
        target_type="section",
        target_id=section_id,
        details={
            "teacher_assignment_policy": "all_teachers_access_all_sections",
            "student_ids": payload.student_ids,
        },
    )
    db.commit()

    refreshed = (
        db.query(Section)
        .options(
            joinedload(Section.teachers).joinedload(SectionTeacherAssignment.teacher),
            joinedload(Section.students).joinedload(SectionStudentAssignment.student),
        )
        .filter(Section.id == section_id)
        .first()
    )
    if not refreshed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found.")
    return section_out(refreshed)


@router.get("/certificates/pending", response_model=list[CertificateTemplateOut])
def list_pending_certificate_templates(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> list[CertificateTemplateOut]:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Certificate review is no longer part of the admin workflow.",
    )


@router.post("/certificates/{template_id}/approve", response_model=CertificateTemplateOut)
def approve_certificate_template(
    template_id: int,
    payload: CertificateReviewRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> CertificateTemplateOut:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Certificate review is no longer part of the admin workflow.",
    )


@router.post("/certificates/{template_id}/reject", response_model=CertificateTemplateOut)
def reject_certificate_template(
    template_id: int,
    payload: CertificateReviewRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> CertificateTemplateOut:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Certificate review is no longer part of the admin workflow.",
    )


@router.get("/reports/login-activity", response_model=LoginActivitySummaryOut)
def get_login_activity_report(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> LoginActivitySummaryOut:
    safe_limit = max(1, min(limit, 500))
    auto_archive_due_students(db)
    db.commit()

    now = utc_now()
    sessions = (
        db.query(UserSession)
        .options(joinedload(UserSession.user))
        .order_by(UserSession.created_at.desc(), UserSession.id.desc())
        .limit(safe_limit)
        .all()
    )
    events: list[LoginActivityEventOut] = []
    by_role = {"student": 0, "teacher": 0, "admin": 0}
    logins_last_24h = 0
    active_sessions = 0
    cutoff = now - timedelta(hours=24)
    for row in sessions:
        user = row.user
        if user is None:
            continue
        role = user.role if user.role in by_role else "student"
        created_at = as_utc(row.created_at) or now
        expires_at = as_utc(row.expires_at) or now
        is_active = expires_at >= now
        if is_active:
            active_sessions += 1
        if created_at >= cutoff:
            logins_last_24h += 1
            by_role[role] = by_role.get(role, 0) + 1
        events.append(
            LoginActivityEventOut(
                session_id=row.id,
                user_id=user.id,
                username=user.username,
                role=role,  # type: ignore[arg-type]
                logged_in_at=row.created_at,
                expires_at=row.expires_at,
                is_active=is_active,
            )
        )
    return LoginActivitySummaryOut(
        total_logins_last_24h=logins_last_24h,
        active_sessions=active_sessions,
        logins_last_24h_by_role=by_role,
        events=events,
    )


@router.get("/reports/admin-actions", response_model=list[AdminAuditEventOut])
def list_admin_audit_events(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> list[AdminAuditEventOut]:
    safe_limit = max(1, min(limit, 500))
    rows = (
        db.query(AdminAuditLog)
        .options(joinedload(AdminAuditLog.admin))
        .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
        .limit(safe_limit)
        .all()
    )
    return [
        AdminAuditEventOut(
            id=row.id,
            admin_user_id=row.admin_user_id,
            admin_username=row.admin.username if row.admin else "Unknown",
            action_type=row.action_type,
            target_type=row.target_type,
            target_id=row.target_id,
            details=dict(row.details or {}),
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/reports/system-activity", response_model=list[SystemActivityEventOut])
def list_system_activity_events(
    limit: int = 150,
    role: Literal["student", "teacher", "admin", "all"] = "all",
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> list[SystemActivityEventOut]:
    safe_limit = max(1, min(limit, 500))
    query = (
        db.query(AdminAuditLog)
        .options(joinedload(AdminAuditLog.admin))
        .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
    )
    rows = query.limit(safe_limit).all()
    events: list[SystemActivityEventOut] = []
    for row in rows:
        actor = row.admin
        actor_role = actor.role if actor and actor.role in {"student", "teacher", "admin"} else "student"
        if role != "all" and actor_role != role:
            continue
        details = dict(row.details or {})
        events.append(
            SystemActivityEventOut(
                id=row.id,
                actor_user_id=row.admin_user_id,
                actor_username=actor.username if actor else "Unknown",
                actor_role=actor_role,  # type: ignore[arg-type]
                actor_email=(actor.email if actor else details.get("actor_email")),
                actor_first_name=(actor.first_name if actor else details.get("actor_first_name")),
                actor_last_name=(actor.last_name if actor else details.get("actor_last_name")),
                actor_company_name=(actor.company_name if actor else details.get("actor_company_name")),
                action_type=row.action_type,
                target_type=row.target_type,
                target_id=row.target_id,
                details=details,
                created_at=row.created_at,
            )
        )
    return events


@router.post("/accounts/archive-non-admin")
def archive_non_admin_accounts(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> dict[str, int | str]:
    now = utc_now()
    users = (
        db.query(User)
        .filter(User.role != "admin", User.archived_at.is_(None))
        .all()
    )
    for user in users:
        user.archived_at = now
        db.add(user)
        db.query(UserSession).filter(UserSession.user_id == user.id).delete(synchronize_session=False)
    _log_admin_action(
        db,
        admin_id=current_admin.id,
        action_type="non_admin_accounts_archived",
        target_type="user",
        target_id=None,
        details={"count": len(users)},
    )
    db.commit()
    return {"message": "All non-admin accounts have been archived.", "count": len(users)}
