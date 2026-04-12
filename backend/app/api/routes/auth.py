from datetime import timedelta
from pathlib import Path
import secrets
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_teacher, get_current_user
from app.core.config import settings
from app.core.datetime_utils import as_utc, utc_now
from app.core.security import create_session_token, hash_password, verify_password
from app.db.session import get_db
from app.models.password_reset_otp import PasswordResetOtp
from app.models.archived_student_account import ArchivedStudentAccount
from app.models.enrollment import Enrollment
from app.models.session import UserSession
from app.models.teacher_invite import TeacherInvite
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordConfirmOtpRequest,
    ForgotPasswordConfirmOtpResponse,
    ForgotPasswordRequest,
    ForgotPasswordResetRequest,
    ForgotPasswordVerifyRequest,
    PasswordChangeRequest,
    TeacherInviteIssueCredentialsRequest,
    TeacherInviteIssueCredentialsResponse,
    TeacherInviteRevokeRequest,
    TeacherInviteVerifyPasskeyRequest,
    TeacherInviteVerifyPasskeyResponse,
    TeacherInviteVerifyQrRequest,
    TeacherInviteVerifyQrResponse,
    UserCreate,
    UserLogin,
    UserSelfArchiveResponse,
    UserOut,
    UserProfileUpdate,
)
from app.services.email_sender import (
    send_password_reset_otp_email,
    send_teacher_initial_credentials_email,
)
from app.services.teacher_invites import (
    create_onboarding_token,
    ensure_invite_is_usable,
    generate_temporary_password,
    parse_qr_payload,
    verify_onboarding_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _remaining_invite_uses(invite: TeacherInvite) -> int | None:
    if invite.max_use_count is None:
        return None
    return max(invite.max_use_count - invite.use_count, 0)


def create_user_session(db: Session, user_id: int) -> str:
    token = create_session_token()
    expires_at = utc_now() + timedelta(hours=settings.session_hours)

    session = UserSession(user_id=user_id, token=token, expires_at=expires_at)
    db.add(session)
    db.commit()
    return token


def find_user_by_identity(db: Session, identity: str) -> User | None:
    trimmed = identity.strip()
    if not trimmed:
        return None

    by_username = (
        db.query(User)
        .filter(User.username == trimmed, User.archived_at.is_(None))
        .first()
    )
    if by_username:
        return by_username

    return (
        db.query(User)
        .filter(User.email == trimmed.lower(), User.archived_at.is_(None))
        .first()
    )


def _get_active_password_reset_otp(db: Session, user_id: int) -> PasswordResetOtp | None:
    return (
        db.query(PasswordResetOtp)
        .filter(
            PasswordResetOtp.user_id == user_id,
            PasswordResetOtp.consumed_at.is_(None),
        )
        .order_by(PasswordResetOtp.created_at.desc())
        .first()
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> AuthResponse:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Registration is no longer available. Contact the LMS admin for your account.",
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> AuthResponse:
    identity = payload.username.strip()
    user = (
        db.query(User)
        .filter(
            or_(User.username == identity, User.email == identity.lower()),
            User.archived_at.is_(None),
        )
        .first()
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    token = create_user_session(db, user.id)
    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.post("/teacher-invite/verify-qr", response_model=TeacherInviteVerifyQrResponse)
def verify_teacher_qr(
    payload: TeacherInviteVerifyQrRequest, db: Session = Depends(get_db)
) -> TeacherInviteVerifyQrResponse:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Teacher invite onboarding has been removed. Contact the LMS admin for your account.",
    )


@router.post("/teacher-invite/verify-passkey", response_model=TeacherInviteVerifyPasskeyResponse)
def verify_teacher_passkey(
    payload: TeacherInviteVerifyPasskeyRequest, db: Session = Depends(get_db)
) -> TeacherInviteVerifyPasskeyResponse:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Teacher invite onboarding has been removed. Contact the LMS admin for your account.",
    )


@router.post(
    "/teacher-invite/issue-credentials", response_model=TeacherInviteIssueCredentialsResponse
)
def issue_teacher_credentials(
    payload: TeacherInviteIssueCredentialsRequest, db: Session = Depends(get_db)
) -> TeacherInviteIssueCredentialsResponse:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Teacher invite onboarding has been removed. Contact the LMS admin for your account.",
    )


@router.post("/teacher-invite/{invite_code}/revoke")
def revoke_teacher_invite(
    invite_code: str,
    payload: TeacherInviteRevokeRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> dict[str, str]:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Teacher invite onboarding has been removed.",
    )


@router.post("/forgot-password/request")
def request_password_reset_otp(
    payload: ForgotPasswordRequest, db: Session = Depends(get_db)
) -> dict[str, str]:
    user = find_user_by_identity(db, payload.username_or_email)
    if not user:
        return {"message": "If the account exists, an OTP code has been sent to the registered email."}
    if not user.email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No email is linked to this account yet. Please contact your teacher/admin.",
        )

    now = utc_now()
    db.query(PasswordResetOtp).filter(
        PasswordResetOtp.expires_at < now,
    ).delete(synchronize_session=False)

    db.query(PasswordResetOtp).filter(
        PasswordResetOtp.user_id == user.id,
        PasswordResetOtp.consumed_at.is_(None),
    ).update(
        {PasswordResetOtp.consumed_at: now},
        synchronize_session=False,
    )

    otp_code = f"{secrets.randbelow(1_000_000):06d}"
    otp_record = PasswordResetOtp(
        user_id=user.id,
        otp_hash=hash_password(otp_code),
        expires_at=now + timedelta(minutes=settings.password_reset_otp_minutes),
    )
    db.add(otp_record)

    try:
        send_password_reset_otp_email(
            to_email=user.email,
            otp_code=otp_code,
            username=user.username,
            otp_valid_minutes=settings.password_reset_otp_minutes,
        )
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    db.commit()
    return {"message": "OTP sent. Check your email inbox for the reset code."}


@router.post("/forgot-password/confirm-otp", response_model=ForgotPasswordConfirmOtpResponse)
def confirm_password_reset_otp(
    payload: ForgotPasswordConfirmOtpRequest, db: Session = Depends(get_db)
) -> ForgotPasswordConfirmOtpResponse:
    user = find_user_by_identity(db, payload.username_or_email)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP request.")

    now = utc_now()
    otp_record = _get_active_password_reset_otp(db, user.id)
    if not otp_record or (as_utc(otp_record.expires_at) and as_utc(otp_record.expires_at) < now):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OTP is missing or expired. Request a new code.",
        )

    if otp_record.attempt_count >= settings.password_reset_max_attempts:
        otp_record.consumed_at = now
        db.add(otp_record)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="OTP attempts exceeded. Please request a new code.",
        )

    if not verify_password(payload.otp_code, otp_record.otp_hash):
        otp_record.attempt_count += 1
        if otp_record.attempt_count >= settings.password_reset_max_attempts:
            otp_record.consumed_at = now
        db.add(otp_record)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP code.")

    reset_token = secrets.token_urlsafe(32)
    otp_record.verified_at = now
    otp_record.reset_token_hash = hash_password(reset_token)
    db.add(otp_record)
    db.commit()

    return ForgotPasswordConfirmOtpResponse(
        message="OTP verified. You can now set a new password.",
        reset_token=reset_token,
    )


@router.post("/forgot-password/reset", response_model=AuthResponse)
def reset_password_with_verified_otp(
    payload: ForgotPasswordResetRequest, db: Session = Depends(get_db)
) -> AuthResponse:
    now = utc_now()
    candidates = (
        db.query(PasswordResetOtp)
        .filter(
            PasswordResetOtp.verified_at.is_not(None),
            PasswordResetOtp.reset_token_hash.is_not(None),
            PasswordResetOtp.consumed_at.is_(None),
        )
        .order_by(PasswordResetOtp.verified_at.desc(), PasswordResetOtp.id.desc())
        .all()
    )

    otp_record = next(
        (
            record
            for record in candidates
            if record.reset_token_hash and verify_password(payload.reset_token, record.reset_token_hash)
        ),
        None,
    )
    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password reset session is invalid or expired. Verify OTP again.",
        )

    if as_utc(otp_record.expires_at) and as_utc(otp_record.expires_at) < now:
        otp_record.consumed_at = now
        db.add(otp_record)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password reset session is expired. Request a new OTP code.",
        )

    user = db.query(User).filter(User.id == otp_record.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP request.")

    otp_record.consumed_at = now
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.add(otp_record)
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_user_session(db, user.id)
    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.post("/forgot-password/verify", response_model=AuthResponse)
def verify_password_reset_otp(
    payload: ForgotPasswordVerifyRequest, db: Session = Depends(get_db)
) -> AuthResponse:
    user = find_user_by_identity(db, payload.username_or_email)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP request.")

    now = utc_now()
    otp_record = _get_active_password_reset_otp(db, user.id)
    if not otp_record or (as_utc(otp_record.expires_at) and as_utc(otp_record.expires_at) < now):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OTP is missing or expired. Request a new code.",
        )

    if otp_record.attempt_count >= settings.password_reset_max_attempts:
        otp_record.consumed_at = now
        db.add(otp_record)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="OTP attempts exceeded. Please request a new code.",
        )

    if not verify_password(payload.otp_code, otp_record.otp_hash):
        otp_record.attempt_count += 1
        if otp_record.attempt_count >= settings.password_reset_max_attempts:
            otp_record.consumed_at = now
        db.add(otp_record)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP code.")

    otp_record.consumed_at = now
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.add(otp_record)
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_user_session(db, user.id)
    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.patch("/me/profile", response_model=UserOut)
def update_my_profile(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    if payload.first_name is not None:
        current_user.first_name = payload.first_name.strip() or None
    if payload.middle_name is not None:
        current_user.middle_name = payload.middle_name.strip() or None
    if payload.last_name is not None:
        current_user.last_name = payload.last_name.strip() or None
    if payload.company_name is not None:
        current_user.company_name = payload.company_name.strip() or None
    if payload.email is not None:
        normalized_email = payload.email.strip().lower()
        if normalized_email:
            existing = (
                db.query(User)
                .filter(User.email == normalized_email, User.id != current_user.id)
                .first()
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT, detail="Email is already in use."
                )
            current_user.email = normalized_email
        else:
            current_user.email = None
    if payload.phone_number is not None:
        current_user.phone_number = payload.phone_number.strip() or None
    if payload.address is not None:
        current_user.address = payload.address.strip() or None
    if payload.birth_date is not None:
        current_user.birth_date = payload.birth_date

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.post("/me/change-password")
def change_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect.")

    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New password must be different from current password.",
        )

    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False
    db.add(current_user)
    db.commit()
    return {"message": "Password updated successfully."}


def _append_archive_note(existing: str | None, note: str) -> str:
    normalized_existing = (existing or "").strip()
    if not normalized_existing:
        return note
    if note in normalized_existing:
        return normalized_existing
    return f"{normalized_existing}\n{note}"


@router.post("/me/unenroll", response_model=UserSelfArchiveResponse)
def unenroll_my_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserSelfArchiveResponse:
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only student accounts can be unenrolled from this screen.",
        )
    if current_user.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is already archived.",
        )

    now = utc_now()
    timestamp_token = now.strftime("%Y%m%d%H%M%S")
    archive_note = f"Student account archived by self-service unenroll on {now.isoformat()}."

    linked_enrollments = (
        db.query(Enrollment)
        .filter(Enrollment.user_id == current_user.id)
        .order_by(Enrollment.id.desc())
        .all()
    )
    primary_enrollment = linked_enrollments[0] if linked_enrollments else None

    existing_archive = (
        db.query(ArchivedStudentAccount)
        .filter(ArchivedStudentAccount.original_user_id == current_user.id)
        .first()
    )
    if existing_archive:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account has already been moved to the archive.",
        )

    db.add(
        ArchivedStudentAccount(
            original_user_id=current_user.id,
            original_username=current_user.username,
            original_email=current_user.email,
            first_name=current_user.first_name,
            middle_name=current_user.middle_name,
            last_name=current_user.last_name,
            company_name=current_user.company_name,
            phone_number=current_user.phone_number,
            address=current_user.address,
            birth_date=current_user.birth_date,
            profile_image_path=current_user.profile_image_path,
            role=current_user.role,
            enrollment_id=primary_enrollment.id if primary_enrollment else None,
            registration_id=primary_enrollment.registration_id if primary_enrollment else None,
            batch_id=primary_enrollment.batch_id if primary_enrollment else None,
            archive_reason="student_unenrolled",
            archived_at=now,
        )
    )

    for enrollment in linked_enrollments:
        enrollment.status = "archived"
        enrollment.user_id = None
        enrollment.review_notes = _append_archive_note(enrollment.review_notes, archive_note)
        db.add(enrollment)

        registration = enrollment.registration
        if registration is not None:
            registration.status = "archived"
            registration.linked_user_id = None
            registration.notes = _append_archive_note(registration.notes, archive_note)
            db.add(registration)

    current_user.archived_at = now
    current_user.username = f"archived-student-{current_user.id}-{timestamp_token}"
    current_user.email = f"archived-student-{current_user.id}-{timestamp_token}@archive.local"
    current_user.phone_number = None
    current_user.company_name = None
    current_user.address = None
    current_user.birth_date = None
    current_user.profile_image_path = None
    current_user.password_hash = hash_password(f"Archived{uuid4().hex}!")
    current_user.must_change_password = False
    db.add(current_user)

    db.query(UserSession).filter(UserSession.user_id == current_user.id).delete(
        synchronize_session=False
    )
    db.query(PasswordResetOtp).filter(PasswordResetOtp.user_id == current_user.id).delete(
        synchronize_session=False
    )

    db.commit()
    return UserSelfArchiveResponse(
        message="Your student account has been unenrolled and moved to the archive."
    )


@router.post("/me/profile-photo", response_model=UserOut)
async def upload_profile_photo(
    profile_photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    suffix = Path(profile_photo.filename or "").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Profile photo must be JPG, PNG, or WEBP.",
        )

    content = await profile_photo.read()
    if len(content) > 6 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Profile photo is too large. Max size is 6MB.",
        )

    uploads_dir = (Path(__file__).resolve().parents[3] / "uploads" / "profiles").resolve()
    uploads_dir.mkdir(parents=True, exist_ok=True)
    filename = f"user-{current_user.id}-{uuid4().hex}{suffix}"
    destination = uploads_dir / filename
    destination.write_bytes(content)

    current_user.profile_image_path = f"uploads/profiles/{filename}"
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)
