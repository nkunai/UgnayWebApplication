from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_student
from app.db.session import get_db
from app.models.certificate import CertificateTemplate
from app.models.lms_progress import SectionModuleItemProgress
from app.models.section import SectionStudentAssignment
from app.models.section_module import SectionModule, SectionModuleItem
from app.models.user import User
from app.schemas.lms import (
    CertificateStudentDownloadOut,
    StudentAssessmentSubmissionRequest,
    StudentCourseOut,
    StudentProgressUpdateOut,
    StudentReadableCompletionRequest,
)
from app.services.lms_service import (
    SELF_PACED_CONTENT_ITEM_TYPES,
    auto_archive_due_students,
    ensure_issued_certificate,
    evaluate_item_submission,
    latest_approved_template,
    refresh_student_completion_schedule,
    section_completion_ready,
    serialize_course_for_student,
    sync_module_progress,
)
from app.services.audit_log_service import log_user_activity


router = APIRouter(prefix="/student", tags=["student-lms"])


def _find_student_item(
    db: Session, current_student: User, item_id: int
) -> tuple[SectionModuleItem, SectionModule, StudentCourseOut]:
    item = (
        db.query(SectionModuleItem)
        .options(joinedload(SectionModuleItem.module).joinedload(SectionModule.items))
        .filter(SectionModuleItem.id == item_id)
        .first()
    )
    if not item or not item.module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learning item not found.")
    course = serialize_course_for_student(db, current_student)
    target_module = next((module for module in course.modules if module.id == item.module.id), None)
    if target_module is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Item is not available to this student.")
    target_item = next((entry for entry in target_module.items if entry.id == item.id), None)
    if target_item is None or target_item.is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Complete the previous lesson or activity first.",
        )
    return item, item.module, course


@router.get("/dashboard", response_model=StudentCourseOut)
def get_student_dashboard(
    db: Session = Depends(get_db),
    current_student: User = Depends(get_current_student),
) -> StudentCourseOut:
    auto_archive_due_students(db)
    refresh_student_completion_schedule(db, student_id=current_student.id)
    db.commit()
    return serialize_course_for_student(db, current_student)


@router.get("/course", response_model=StudentCourseOut)
def get_student_course(
    db: Session = Depends(get_db),
    current_student: User = Depends(get_current_student),
) -> StudentCourseOut:
    auto_archive_due_students(db)
    refresh_student_completion_schedule(db, student_id=current_student.id)
    db.commit()
    return serialize_course_for_student(db, current_student)


@router.post("/module-items/{item_id}/complete", response_model=StudentProgressUpdateOut)
def complete_readable_item(
    item_id: int,
    payload: StudentReadableCompletionRequest,
    db: Session = Depends(get_db),
    current_student: User = Depends(get_current_student),
) -> StudentProgressUpdateOut:
    item, module, _ = _find_student_item(db, current_student, item_id)
    if item.item_type not in SELF_PACED_CONTENT_ITEM_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only content items can be marked as completed.",
        )

    progress = (
        db.query(SectionModuleItemProgress)
        .filter(
            SectionModuleItemProgress.student_id == current_student.id,
            SectionModuleItemProgress.section_module_item_id == item.id,
        )
        .first()
    )
    if progress is None:
        progress = SectionModuleItemProgress(
            student_id=current_student.id,
            section_module_id=module.id,
            section_module_item_id=item.id,
        )
    progress.status = "completed"
    progress.is_correct = True
    progress.score_percent = 100
    progress.attempt_count = max(progress.attempt_count, 1)
    progress.duration_seconds = max(progress.duration_seconds, payload.duration_seconds)
    db.add(progress)
    log_user_activity(
        db,
        actor=current_student,
        action_type="student_item_completed",
        target_type="section_module_item",
        target_id=item.id,
        details={
            "module_id": module.id,
            "item_type": item.item_type,
            "duration_seconds": payload.duration_seconds,
        },
    )
    module_progress = sync_module_progress(db, student_id=current_student.id, module=module)
    refresh_student_completion_schedule(db, student_id=current_student.id)
    auto_archive_due_students(db)
    db.commit()
    return StudentProgressUpdateOut(
        module_id=module.id,
        item_id=item.id,
        module_status=module_progress.status,
        module_progress_percent=module_progress.progress_percent,
        item_status=progress.status,
        is_correct=progress.is_correct,
        score_percent=progress.score_percent,
    )


@router.post("/module-items/{item_id}/submit", response_model=StudentProgressUpdateOut)
def submit_learning_item(
    item_id: int,
    payload: StudentAssessmentSubmissionRequest,
    db: Session = Depends(get_db),
    current_student: User = Depends(get_current_student),
) -> StudentProgressUpdateOut:
    item, module, _ = _find_student_item(db, current_student, item_id)
    is_correct, resolved_score = evaluate_item_submission(item, payload.response_text, payload.score_percent)
    progress = (
        db.query(SectionModuleItemProgress)
        .filter(
            SectionModuleItemProgress.student_id == current_student.id,
            SectionModuleItemProgress.section_module_item_id == item.id,
        )
        .first()
    )
    if progress is None:
        progress = SectionModuleItemProgress(
            student_id=current_student.id,
            section_module_id=module.id,
            section_module_item_id=item.id,
        )

    progress.status = "completed"
    progress.response_text = payload.response_text.strip()
    progress.is_correct = is_correct
    progress.score_percent = resolved_score
    progress.attempt_count += 1
    progress.duration_seconds += payload.duration_seconds
    progress.submitted_payload = dict(payload.extra_payload or {})
    db.add(progress)
    log_user_activity(
        db,
        actor=current_student,
        action_type="student_item_submitted",
        target_type="section_module_item",
        target_id=item.id,
        details={
            "module_id": module.id,
            "item_type": item.item_type,
            "attempt_count": progress.attempt_count,
            "is_correct": progress.is_correct,
            "score_percent": progress.score_percent,
            "duration_seconds": payload.duration_seconds,
        },
    )
    module_progress = sync_module_progress(db, student_id=current_student.id, module=module)
    refresh_student_completion_schedule(db, student_id=current_student.id)
    auto_archive_due_students(db)
    db.commit()
    return StudentProgressUpdateOut(
        module_id=module.id,
        item_id=item.id,
        module_status=module_progress.status,
        module_progress_percent=module_progress.progress_percent,
        item_status=progress.status,
        is_correct=progress.is_correct,
        score_percent=progress.score_percent,
    )


@router.get("/certificate", response_model=CertificateStudentDownloadOut)
def get_student_certificate_status(
    db: Session = Depends(get_db),
    current_student: User = Depends(get_current_student),
) -> CertificateStudentDownloadOut:
    auto_archive_due_students(db)
    assignment = (
        db.query(SectionStudentAssignment)
        .options(joinedload(SectionStudentAssignment.section))
        .filter(SectionStudentAssignment.student_id == current_student.id)
        .first()
    )
    if not assignment or not assignment.section:
        return CertificateStudentDownloadOut(
            eligible=False,
            message="You are not assigned to a section yet.",
        )
    refresh_student_completion_schedule(db, student_id=current_student.id)
    template = latest_approved_template(db, assignment.section_id)
    if template is None:
        return CertificateStudentDownloadOut(
            eligible=False,
            section_name=assignment.section.name,
            message="Certificate template is not available yet for this section.",
        )
    if not section_completion_ready(db, current_student.id, assignment.section_id):
        return CertificateStudentDownloadOut(
            eligible=False,
            template_id=template.id,
            section_name=assignment.section.name,
            message="Finish all published modules first before downloading your certificate.",
        )
    ensure_issued_certificate(
        db,
        template=template,
        student_id=current_student.id,
        section_id=assignment.section_id,
    )
    auto_archive_due_students(db)
    db.commit()
    return CertificateStudentDownloadOut(
        eligible=True,
        template_id=template.id,
        section_name=assignment.section.name,
        message="Certificate is ready to download.",
    )


@router.get("/certificate/download")
def download_student_certificate(
    db: Session = Depends(get_db),
    current_student: User = Depends(get_current_student),
) -> Response:
    auto_archive_due_students(db)
    assignment = (
        db.query(SectionStudentAssignment)
        .options(joinedload(SectionStudentAssignment.section))
        .filter(SectionStudentAssignment.student_id == current_student.id)
        .first()
    )
    if not assignment or not assignment.section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found.")

    template = latest_approved_template(db, assignment.section_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Certificate template is not available yet for this section.",
        )
    if not section_completion_ready(db, current_student.id, assignment.section_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Finish all published modules first before downloading your certificate.",
        )
    ensure_issued_certificate(
        db,
        template=template,
        student_id=current_student.id,
        section_id=assignment.section_id,
    )
    log_user_activity(
        db,
        actor=current_student,
        action_type="student_certificate_downloaded",
        target_type="certificate_template",
        target_id=template.id,
        details={"section_id": assignment.section_id, "section_name": assignment.section.name},
    )
    refresh_student_completion_schedule(db, student_id=current_student.id)
    auto_archive_due_students(db)
    db.commit()

    display_name = " ".join(
        part for part in [current_student.first_name, current_student.last_name] if part
    ).strip() or current_student.username
    html = f"""
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>UGNAY Certificate</title>
    <style>
      body {{ font-family: Georgia, serif; padding: 40px; background: #f5f4f1; color: #1c1c2e; }}
      .card {{ max-width: 900px; margin: 0 auto; padding: 56px; border: 8px solid #2e44a8; background: white; }}
      h1 {{ font-size: 42px; margin-bottom: 16px; }}
      .accent {{ color: #2a8c3f; font-weight: bold; }}
      .meta {{ margin-top: 32px; font-size: 14px; color: #555; }}
    </style>
  </head>
  <body>
    <div class="card">
      <p>UGNAY Learning Hub</p>
      <h1>Certificate of Completion</h1>
      <p>This certifies that <span class="accent">{display_name}</span> completed the LMS course for <span class="accent">{assignment.section.name}</span>.</p>
      <p>Approved certificate template: {template.original_file_name}</p>
      <p class="meta">Generated by the system after completing all published modules.</p>
    </div>
  </body>
</html>
""".strip()
    headers = {
        "Content-Disposition": f'attachment; filename="ugnay-certificate-{current_student.id}.html"'
    }
    return Response(content=html, media_type="text/html", headers=headers)
