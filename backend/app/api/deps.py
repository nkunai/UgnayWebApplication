from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.datetime_utils import as_utc, utc_now
from app.db.session import get_db
from app.models.session import UserSession
from app.models.user import User
from app.services.lms_service import auto_archive_due_students

DEMO_USERNAME = "student_demo"
TEACHER_ROLES = {"teacher", "admin"}


def _normalize_user_role(user: User, db: Session) -> User:
    if user.role:
        return user

    user.role = "student"
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _get_or_create_demo_user(db: Session) -> User:
    user = db.query(User).filter(User.username == DEMO_USERNAME).first()
    if user:
        return _normalize_user_role(user, db)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Student demo user is not available. Create it during bootstrap first.",
    )


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    auto_archive_due_students(db)
    db.commit()
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header.",
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header.",
        )

    token = authorization.split(" ", maxsplit=1)[1].strip()
    session = db.query(UserSession).filter(UserSession.token == token).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session token.")

    expires_at = as_utc(session.expires_at)
    if expires_at and expires_at < utc_now():
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session has expired.")

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    if user.archived_at is not None:
        db.delete(session)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account is no longer active.",
        )
    return _normalize_user_role(user, db)


def get_current_learning_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization:
        return _get_or_create_demo_user(db)
    return get_current_user(authorization=authorization, db=db)


def get_current_student(current_user: User = Depends(get_current_learning_user)) -> User:
    if current_user.role not in {"student", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student access required.",
        )
    return current_user


def has_teacher_access(user: User) -> bool:
    return user.role in TEACHER_ROLES


def get_current_teacher(current_user: User = Depends(get_current_user)) -> User:
    if not has_teacher_access(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher access required.",
        )
    return current_user


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user
