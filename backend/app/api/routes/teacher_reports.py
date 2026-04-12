from collections import Counter, defaultdict
from datetime import datetime
from statistics import mean

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_teacher
from app.db.session import get_db
from app.models.activity_attempt import ActivityAttempt
from app.models.assessment_report import AssessmentReport
from app.models.batch import Batch
from app.models.enrollment import Enrollment
from app.models.module import Module
from app.models.user import User
from app.schemas.teacher_report import (
    TeacherActivityAttemptItemOut,
    TeacherActivityAttemptOut,
    TeacherAllBreakdownResponse,
    TeacherAllBreakdownRowOut,
    TeacherAssessmentReportOut,
    TeacherAssessmentReportsResponse,
    TeacherAttentionStudentOut,
    TeacherBatchBreakdownResponse,
    TeacherBatchModuleBreakdownResponse,
    TeacherBatchModuleBreakdownRowOut,
    TeacherBatchBreakdownRowOut,
    TeacherBreakdownModuleMetricOut,
    TeacherConcernAttemptOut,
    TeacherGeneratedStudentReport,
    TeacherImprovementAreaItem,
    TeacherModuleBreakdownResponse,
    TeacherModuleBreakdownRowOut,
    TeacherModuleSummary,
    TeacherReportBreakdownResponse,
    TeacherReportSummaryOut,
    TeacherStudentReportRow,
    TeacherStudentReportTableResponse,
    TeacherWeakItemOut,
)

router = APIRouter(prefix="/teacher/reports", tags=["teacher-reports"])

WEAK_ITEM_MIN_ATTEMPTS = 5
WEAK_ITEM_WRONG_RATE_PERCENT = 40.0
STUDENT_ATTENTION_AVERAGE_THRESHOLD = 75.0
STUDENT_ATTENTION_LOW_SCORE_THRESHOLD = 60.0
STUDENT_ATTENTION_LOW_SCORE_COUNT = 2
RECENT_LOW_CONFIDENCE_THRESHOLD = 0.4


def _display_name(user: User) -> str:
    full_name = " ".join(
        part.strip()
        for part in [user.first_name or "", user.middle_name or "", user.last_name or ""]
        if part and part.strip()
    ).strip()
    return full_name or user.username


def _approved_enrollments_by_user(
    db: Session,
    *,
    include_archived_batches: bool = True,
) -> dict[int, Enrollment]:
    rows = (
        db.query(Enrollment)
        .options(joinedload(Enrollment.batch), joinedload(Enrollment.user))
        .join(User, User.id == Enrollment.user_id)
        .filter(Enrollment.status == "approved")
        .filter(User.archived_at.is_(None))
        .order_by(Enrollment.approved_at.desc(), Enrollment.id.desc())
        .all()
    )
    mapping: dict[int, Enrollment] = {}
    for enrollment in rows:
        if (
            not include_archived_batches
            and enrollment.batch is not None
            and enrollment.batch.status == "archived"
        ):
            continue
        if (
            enrollment.user_id
            and enrollment.user is not None
            and enrollment.user.role == "student"
            and enrollment.user_id not in mapping
        ):
            mapping[enrollment.user_id] = enrollment
    return mapping


def _registered_student_count(db: Session) -> int:
    return len(_approved_enrollments_by_user(db, include_archived_batches=False))


def _filtered_attempts(
    db: Session,
    *,
    batch_id: int | None = None,
    module_id: int | None = None,
    student_id: int | None = None,
    include_archived_batches: bool = True,
) -> list[ActivityAttempt]:
    query = (
        db.query(ActivityAttempt)
        .options(
            joinedload(ActivityAttempt.user),
            joinedload(ActivityAttempt.module),
            selectinload(ActivityAttempt.items),
        )
        .join(User, User.id == ActivityAttempt.user_id)
        .filter(User.role == "student")
        .filter(User.archived_at.is_(None))
        .order_by(ActivityAttempt.submitted_at.desc(), ActivityAttempt.id.desc())
    )
    if module_id is not None:
        query = query.filter(ActivityAttempt.module_id == module_id)
    if student_id is not None:
        query = query.filter(ActivityAttempt.user_id == student_id)
    attempts = query.all()
    enrollment_by_user = _approved_enrollments_by_user(
        db,
        include_archived_batches=include_archived_batches,
    )

    if batch_id is not None:
        return [
            attempt
            for attempt in attempts
            if (
                enrollment := enrollment_by_user.get(attempt.user_id)
            )
            and enrollment.batch_id == batch_id
            and (
                include_archived_batches
                or enrollment.batch is None
                or enrollment.batch.status != "archived"
            )
        ]

    if include_archived_batches:
        return attempts

    return [
        attempt
        for attempt in attempts
        if (
            enrollment := enrollment_by_user.get(attempt.user_id)
        )
        and (enrollment.batch is None or enrollment.batch.status != "archived")
    ]


def _activity_attempt_out(attempt: ActivityAttempt) -> TeacherActivityAttemptOut:
    return TeacherActivityAttemptOut(
        id=attempt.id,
        student_id=attempt.user_id,
        student_name=_display_name(attempt.user),
        module_id=attempt.module_id,
        module_title=attempt.module.title,
        activity_id=attempt.module_activity_id,
        activity_key=attempt.activity_key,
        activity_title=attempt.activity_title,
        activity_type=attempt.activity_type,
        right_count=attempt.right_count,
        wrong_count=attempt.wrong_count,
        total_items=attempt.total_items,
        score_percent=attempt.score_percent,
        improvement_areas=list(attempt.improvement_areas or []),
        ai_metadata=dict(attempt.ai_metadata or {}),
        submitted_at=attempt.submitted_at,
        items=[
            TeacherActivityAttemptItemOut(
                id=item.id,
                item_key=item.item_key,
                prompt=item.prompt,
                expected_answer=item.expected_answer,
                student_answer=item.student_answer,
                is_correct=item.is_correct,
                confidence=item.confidence,
                ai_metadata=dict(item.ai_metadata or {}),
            )
            for item in attempt.items
        ],
    )


def _top_module_metric(
    module_totals: dict[tuple[int, str], dict[str, int]], metric_key: str
) -> TeacherBreakdownModuleMetricOut | None:
    if not module_totals:
        return None

    (module_id, module_title), values = sorted(
        module_totals.items(),
        key=lambda item: (-item[1][metric_key], item[0][1].lower(), item[0][0]),
    )[0]
    return TeacherBreakdownModuleMetricOut(
        module_id=module_id,
        module_title=module_title,
        count=values[metric_key],
    )


@router.get("", response_model=TeacherAssessmentReportsResponse)
def list_teacher_reports(
    db: Session = Depends(get_db), _: User = Depends(get_current_teacher)
) -> TeacherAssessmentReportsResponse:
    rows = (
        db.query(AssessmentReport)
        .order_by(AssessmentReport.created_at.desc(), AssessmentReport.id.desc())
        .all()
    )
    reports = [
        TeacherAssessmentReportOut(
            id=row.id,
            student_id=row.user_id,
            module_id=row.module_id,
            module_title=row.module_title,
            assessment_id=row.assessment_id,
            assessment_title=row.assessment_title,
            right_count=row.right_count,
            wrong_count=row.wrong_count,
            total_items=row.total_items,
            score_percent=row.score_percent,
            improvement_areas=list(row.improvement_areas or []),
            status=row.status,
            created_at=row.created_at,
        )
        for row in rows
    ]
    return TeacherAssessmentReportsResponse(reports=reports)


@router.get("/students", response_model=TeacherStudentReportTableResponse)
def list_teacher_student_report_rows(
    db: Session = Depends(get_db), _: User = Depends(get_current_teacher)
) -> TeacherStudentReportTableResponse:
    rows = (
        db.query(AssessmentReport, User)
        .join(User, User.id == AssessmentReport.user_id)
        .filter(User.archived_at.is_(None))
        .order_by(AssessmentReport.created_at.desc(), AssessmentReport.id.desc())
        .all()
    )

    by_student: dict[int, TeacherStudentReportRow] = {}
    score_totals: dict[int, tuple[float, int]] = {}

    for report, student in rows:
        if student.id not in by_student:
            by_student[student.id] = TeacherStudentReportRow(
                student_id=student.id,
                student_name=_display_name(student),
                student_email=student.email,
                total_assessments=0,
                pending_reports=0,
                generated_reports=0,
                average_score_percent=0,
                latest_activity_at=report.created_at,
            )
            score_totals[student.id] = (0.0, 0)

        row = by_student[student.id]
        row.total_assessments += 1
        if report.status == "queued":
            row.pending_reports += 1
        else:
            row.generated_reports += 1

        score_sum, score_count = score_totals[student.id]
        score_totals[student.id] = (score_sum + float(report.score_percent), score_count + 1)

        if row.latest_activity_at is None or report.created_at > row.latest_activity_at:
            row.latest_activity_at = report.created_at

    students: list[TeacherStudentReportRow] = []
    for student_id, row in by_student.items():
        score_sum, score_count = score_totals[student_id]
        row.average_score_percent = round(score_sum / score_count, 2) if score_count else 0.0
        students.append(row)

    students.sort(key=lambda item: item.latest_activity_at or datetime.min, reverse=True)
    return TeacherStudentReportTableResponse(students=students)


@router.post("/students/{student_id}/generate", response_model=TeacherGeneratedStudentReport)
def generate_teacher_student_report(
    student_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> TeacherGeneratedStudentReport:
    student = (
        db.query(User)
        .filter(User.id == student_id, User.role == "student", User.archived_at.is_(None))
        .first()
    )
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    report_rows = (
        db.query(AssessmentReport)
        .filter(AssessmentReport.user_id == student_id)
        .order_by(AssessmentReport.created_at.asc(), AssessmentReport.id.asc())
        .all()
    )

    if not report_rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No assessment records found for this student.",
        )

    pending_before = sum(1 for row in report_rows if row.status == "queued")

    module_aggregates: dict[tuple[int, str], dict[str, int]] = {}
    improvement_counter: Counter[str] = Counter()

    total_right = 0
    total_wrong = 0
    total_items = 0

    for row in report_rows:
        total_right += int(row.right_count or 0)
        total_wrong += int(row.wrong_count or 0)
        total_items += int(row.total_items or 0)

        key = (row.module_id, row.module_title)
        if key not in module_aggregates:
            module_aggregates[key] = {
                "assessments_taken": 0,
                "right_count": 0,
                "wrong_count": 0,
                "total_items": 0,
            }

        agg = module_aggregates[key]
        agg["assessments_taken"] += 1
        agg["right_count"] += int(row.right_count or 0)
        agg["wrong_count"] += int(row.wrong_count or 0)
        agg["total_items"] += int(row.total_items or 0)

        for area in list(row.improvement_areas or []):
            normalized = area.strip()
            if normalized:
                improvement_counter[normalized] += 1

        if row.status == "queued":
            row.status = "generated"
            db.add(row)

    module_summaries: list[TeacherModuleSummary] = []
    for (module_id, module_title), values in module_aggregates.items():
        items = values["total_items"]
        score_percent = round((values["right_count"] / items) * 100, 2) if items > 0 else 0.0
        module_summaries.append(
            TeacherModuleSummary(
                module_id=module_id,
                module_title=module_title,
                assessments_taken=values["assessments_taken"],
                right_count=values["right_count"],
                wrong_count=values["wrong_count"],
                total_items=items,
                score_percent=score_percent,
            )
        )
    module_summaries.sort(key=lambda item: item.module_id)

    top_improvement_areas = [
        TeacherImprovementAreaItem(area=area, count=count)
        for area, count in improvement_counter.most_common(12)
    ]

    db.commit()

    overall_score_percent = round((total_right / total_items) * 100, 2) if total_items > 0 else 0.0

    return TeacherGeneratedStudentReport(
        student_id=student.id,
        student_name=_display_name(student),
        student_email=student.email,
        generated_at=datetime.utcnow(),
        total_assessments=len(report_rows),
        pending_reports_before_generate=pending_before,
        total_right=total_right,
        total_wrong=total_wrong,
        total_items=total_items,
        overall_score_percent=overall_score_percent,
        modules=module_summaries,
        top_improvement_areas=top_improvement_areas,
    )


@router.get("/students/{student_id}/activity-attempts", response_model=list[TeacherActivityAttemptOut])
def list_student_activity_attempts(
    student_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> list[TeacherActivityAttemptOut]:
    attempts = _filtered_attempts(db, student_id=student_id)
    if not attempts:
        student = (
            db.query(User)
            .filter(User.id == student_id, User.role == "student", User.archived_at.is_(None))
            .first()
        )
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")
    return [_activity_attempt_out(attempt) for attempt in attempts]


@router.get("/activity-attempts/{attempt_id}", response_model=TeacherActivityAttemptOut)
def get_activity_attempt_detail(
    attempt_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> TeacherActivityAttemptOut:
    attempt = (
        db.query(ActivityAttempt)
        .options(joinedload(ActivityAttempt.user), joinedload(ActivityAttempt.module), selectinload(ActivityAttempt.items))
        .filter(ActivityAttempt.id == attempt_id)
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity attempt not found.")
    return _activity_attempt_out(attempt)


@router.get("/breakdown", response_model=TeacherReportBreakdownResponse)
def get_teacher_report_breakdown(
    batch_id: int | None = Query(default=None, ge=1),
    module_id: int | None = Query(default=None, ge=1),
    include_archived_batches: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> TeacherReportBreakdownResponse:
    if batch_id is None and module_id is None:
        enrollment_by_user = _approved_enrollments_by_user(
            db,
            include_archived_batches=include_archived_batches,
        )
        attempts = _filtered_attempts(
            db,
            include_archived_batches=include_archived_batches,
        )
        attempts_by_student: dict[int, list[ActivityAttempt]] = defaultdict(list)
        for attempt in attempts:
            attempts_by_student[attempt.user_id].append(attempt)

        rows: list[TeacherAllBreakdownRowOut] = []
        for student_id, enrollment in enrollment_by_user.items():
            student_attempts = attempts_by_student.get(student_id, [])
            latest_attempt = (
                max(student_attempts, key=lambda item: (item.submitted_at, item.id))
                if student_attempts
                else None
            )
            rows.append(
                TeacherAllBreakdownRowOut(
                    student_id=student_id,
                    student_name=_display_name(enrollment.user),
                    batch_id=enrollment.batch_id,
                    batch_name=enrollment.batch.name if enrollment.batch else "Unassigned batch",
                    average_score_percent=(
                        round(mean(attempt.score_percent for attempt in student_attempts), 2)
                        if student_attempts
                        else None
                    ),
                    attempt_count=len(student_attempts),
                    latest_attempt_at=latest_attempt.submitted_at if latest_attempt else None,
                )
            )

        rows.sort(
            key=lambda item: (
                item.attempt_count == 0,
                item.average_score_percent if item.average_score_percent is not None else float("inf"),
                -(item.latest_attempt_at.timestamp() if item.latest_attempt_at else 0),
                item.student_name.lower(),
                item.student_id,
            )
        )

        return TeacherAllBreakdownResponse(
            mode="all",
            rows=rows,
        )

    enrollment_by_user = _approved_enrollments_by_user(
        db,
        include_archived_batches=include_archived_batches,
    )

    if batch_id is not None and module_id is None:
        batch = db.query(Batch).filter(Batch.id == batch_id).first()
        if not batch:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")

        attempts = _filtered_attempts(
            db,
            batch_id=batch_id,
            include_archived_batches=include_archived_batches,
        )
        attempts_by_student: dict[int, list[ActivityAttempt]] = defaultdict(list)

        for attempt in attempts:
            attempts_by_student[attempt.user_id].append(attempt)

        rows: list[TeacherBatchBreakdownRowOut] = []
        for student_id, student_attempts in attempts_by_student.items():
            module_totals: dict[tuple[int, str], dict[str, int]] = {}

            for attempt in student_attempts:
                key = (attempt.module_id, attempt.module.title)
                totals = module_totals.setdefault(key, {"right_count": 0, "wrong_count": 0})
                totals["right_count"] += int(attempt.right_count or 0)
                totals["wrong_count"] += int(attempt.wrong_count or 0)

            reference_attempt = student_attempts[0]
            rows.append(
                TeacherBatchBreakdownRowOut(
                    student_id=student_id,
                    student_name=_display_name(reference_attempt.user),
                    average_score_percent=round(mean(attempt.score_percent for attempt in student_attempts), 2),
                    attempt_count=len(student_attempts),
                    latest_attempt_at=max(
                        student_attempts,
                        key=lambda item: (item.submitted_at, item.id),
                    ).submitted_at,
                    highest_correct_module=_top_module_metric(module_totals, "right_count"),
                    highest_incorrect_module=_top_module_metric(module_totals, "wrong_count"),
                )
            )

        rows.sort(
            key=lambda item: (
                item.average_score_percent,
                -(item.highest_incorrect_module.count if item.highest_incorrect_module else 0),
                -item.latest_attempt_at.timestamp(),
                item.student_name.lower(),
                item.student_id,
            )
        )

        return TeacherBatchBreakdownResponse(
            mode="batch",
            batch_id=batch.id,
            batch_name=batch.name,
            rows=rows,
        )

    if batch_id is not None and module_id is not None:
        batch = db.query(Batch).filter(Batch.id == batch_id).first()
        if not batch:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")

        module = db.query(Module).filter(Module.id == module_id).first()
        if not module:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")

        attempts = _filtered_attempts(
            db,
            batch_id=batch_id,
            module_id=module_id,
            include_archived_batches=include_archived_batches,
        )
        attempts_by_student: dict[int, list[ActivityAttempt]] = defaultdict(list)

        for attempt in attempts:
            attempts_by_student[attempt.user_id].append(attempt)

        rows: list[TeacherBatchModuleBreakdownRowOut] = []
        for student_id, student_attempts in attempts_by_student.items():
            latest_attempt = max(student_attempts, key=lambda item: (item.submitted_at, item.id))
            rows.append(
                TeacherBatchModuleBreakdownRowOut(
                    student_id=student_id,
                    student_name=_display_name(latest_attempt.user),
                    average_score_percent=round(mean(attempt.score_percent for attempt in student_attempts), 2),
                    attempt_count=len(student_attempts),
                    correct_answers=sum(int(attempt.right_count or 0) for attempt in student_attempts),
                    incorrect_answers=sum(int(attempt.wrong_count or 0) for attempt in student_attempts),
                    latest_attempt_at=latest_attempt.submitted_at,
                )
            )

        rows.sort(
            key=lambda item: (
                item.average_score_percent,
                -item.incorrect_answers,
                -item.latest_attempt_at.timestamp(),
                item.student_name.lower(),
                item.student_id,
            )
        )

        return TeacherBatchModuleBreakdownResponse(
            mode="batch_module",
            batch_id=batch.id,
            batch_name=batch.name,
            module_id=module.id,
            module_title=module.title,
            rows=rows,
        )

    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")

    attempts = _filtered_attempts(
        db,
        module_id=module_id,
        include_archived_batches=include_archived_batches,
    )
    attempts_by_batch: dict[tuple[int | None, str], list[ActivityAttempt]] = defaultdict(list)

    for attempt in attempts:
        enrollment = enrollment_by_user.get(attempt.user_id)
        batch_key = (
            enrollment.batch_id if enrollment else None,
            enrollment.batch.name if enrollment and enrollment.batch else "Unassigned batch",
        )
        attempts_by_batch[batch_key].append(attempt)

    rows: list[TeacherModuleBreakdownRowOut] = []
    for (group_batch_id, batch_name), batch_attempts in attempts_by_batch.items():
        rows.append(
            TeacherModuleBreakdownRowOut(
                batch_id=group_batch_id,
                batch_name=batch_name,
                average_score_percent=round(mean(attempt.score_percent for attempt in batch_attempts), 2),
                attempt_count=len(batch_attempts),
                correct_answers=sum(int(attempt.right_count or 0) for attempt in batch_attempts),
                incorrect_answers=sum(int(attempt.wrong_count or 0) for attempt in batch_attempts),
            )
        )

    rows.sort(
        key=lambda item: (
            item.average_score_percent,
            -item.incorrect_answers,
            item.batch_name.lower(),
            item.batch_id or 0,
        )
    )

    return TeacherModuleBreakdownResponse(
        mode="module",
        module_id=module.id,
        module_title=module.title,
        rows=rows,
    )


@router.get("/summary", response_model=TeacherReportSummaryOut)
def get_teacher_report_summary(
    batch_id: int | None = Query(default=None, ge=1),
    module_id: int | None = Query(default=None, ge=1),
    include_archived_batches: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> TeacherReportSummaryOut:
    registered_student_count = _registered_student_count(db)
    attempts = _filtered_attempts(
        db,
        batch_id=batch_id,
        module_id=module_id,
        include_archived_batches=include_archived_batches,
    )
    enrollment_by_user = _approved_enrollments_by_user(db)

    if not attempts:
        return TeacherReportSummaryOut(
            batch_id=batch_id,
            module_id=module_id,
            registered_student_count=registered_student_count,
            total_students=0,
            total_attempts=0,
            average_score_percent=0.0,
        )

    item_aggregates: dict[tuple[str, str], dict] = {}
    attempts_by_student: dict[int, list[ActivityAttempt]] = defaultdict(list)
    recent_concern_attempts: list[TeacherConcernAttemptOut] = []

    for attempt in attempts:
        attempts_by_student[attempt.user_id].append(attempt)
        low_confidence_item_count = 0

        for item in attempt.items:
            key = (attempt.activity_key, item.item_key)
            aggregate = item_aggregates.setdefault(
                key,
                {
                    "module_id": attempt.module_id,
                    "module_title": attempt.module.title,
                    "activity_key": attempt.activity_key,
                    "activity_title": attempt.activity_title,
                    "item_key": item.item_key,
                    "prompt": item.prompt,
                    "expected_answer": item.expected_answer,
                    "wrong_count": 0,
                    "attempt_count": 0,
                },
            )
            aggregate["attempt_count"] += 1
            if item.is_correct is False:
                aggregate["wrong_count"] += 1
            if item.confidence is not None and item.confidence < RECENT_LOW_CONFIDENCE_THRESHOLD:
                low_confidence_item_count += 1

        enrollment = enrollment_by_user.get(attempt.user_id)
        if attempt.score_percent < STUDENT_ATTENTION_LOW_SCORE_THRESHOLD or low_confidence_item_count > 0:
            recent_concern_attempts.append(
                TeacherConcernAttemptOut(
                    attempt_id=attempt.id,
                    student_id=attempt.user_id,
                    student_name=_display_name(attempt.user),
                    batch_id=enrollment.batch_id if enrollment else None,
                    batch_name=enrollment.batch.name if enrollment and enrollment.batch else None,
                    module_id=attempt.module_id,
                    module_title=attempt.module.title,
                    activity_key=attempt.activity_key,
                    activity_title=attempt.activity_title,
                    score_percent=attempt.score_percent,
                    low_confidence_item_count=low_confidence_item_count,
                    submitted_at=attempt.submitted_at,
                )
            )

    weak_items: list[TeacherWeakItemOut] = []
    for aggregate in item_aggregates.values():
        attempt_count = aggregate["attempt_count"]
        wrong_count = aggregate["wrong_count"]
        wrong_rate = (wrong_count / attempt_count * 100) if attempt_count else 0.0
        if attempt_count >= WEAK_ITEM_MIN_ATTEMPTS and wrong_rate >= WEAK_ITEM_WRONG_RATE_PERCENT:
            weak_items.append(
                TeacherWeakItemOut(
                    module_id=aggregate["module_id"],
                    module_title=aggregate["module_title"],
                    activity_key=aggregate["activity_key"],
                    activity_title=aggregate["activity_title"],
                    item_key=aggregate["item_key"],
                    prompt=aggregate["prompt"],
                    expected_answer=aggregate["expected_answer"],
                    wrong_count=wrong_count,
                    attempt_count=attempt_count,
                    wrong_rate_percent=round(wrong_rate, 2),
                )
            )
    weak_items.sort(key=lambda item: (item.wrong_rate_percent, item.wrong_count), reverse=True)

    students_needing_attention: list[TeacherAttentionStudentOut] = []
    for student_id, student_attempts in attempts_by_student.items():
        sorted_attempts = sorted(
            student_attempts,
            key=lambda item: (item.submitted_at, item.id),
            reverse=True,
        )
        average_score = mean(attempt.score_percent for attempt in sorted_attempts)
        latest_five = sorted_attempts[:5]
        low_score_count = sum(
            1 for attempt in latest_five if attempt.score_percent < STUDENT_ATTENTION_LOW_SCORE_THRESHOLD
        )
        if average_score < STUDENT_ATTENTION_AVERAGE_THRESHOLD or low_score_count >= STUDENT_ATTENTION_LOW_SCORE_COUNT:
            latest_attempt = sorted_attempts[0]
            enrollment = enrollment_by_user.get(student_id)
            students_needing_attention.append(
                TeacherAttentionStudentOut(
                    student_id=student_id,
                    student_name=_display_name(latest_attempt.user),
                    student_email=latest_attempt.user.email,
                    batch_id=enrollment.batch_id if enrollment else None,
                    batch_name=enrollment.batch.name if enrollment and enrollment.batch else None,
                    attempt_count=len(sorted_attempts),
                    average_score_percent=round(average_score, 2),
                    low_score_count=low_score_count,
                    latest_attempt_at=latest_attempt.submitted_at,
                )
            )
    students_needing_attention.sort(
        key=lambda item: (item.average_score_percent, item.low_score_count, item.latest_attempt_at)
    )

    recent_concern_attempts.sort(key=lambda item: item.submitted_at, reverse=True)

    return TeacherReportSummaryOut(
        batch_id=batch_id,
        module_id=module_id,
        registered_student_count=registered_student_count,
        total_students=len(attempts_by_student),
        total_attempts=len(attempts),
        average_score_percent=round(mean(attempt.score_percent for attempt in attempts), 2),
        weak_items=weak_items[:10],
        students_needing_attention=students_needing_attention[:10],
        recent_concern_attempts=recent_concern_attempts[:10],
    )
