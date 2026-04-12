from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    middle_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    company_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    phone_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    profile_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="student", server_default="student"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    password_reset_otps = relationship(
        "PasswordResetOtp", back_populates="user", cascade="all, delete-orphan"
    )
    progress_entries = relationship(
        "UserModuleProgress", back_populates="user", cascade="all, delete-orphan"
    )
    enrollments = relationship(
        "Enrollment",
        back_populates="user",
        foreign_keys="Enrollment.user_id",
    )
    activity_attempts = relationship(
        "ActivityAttempt",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="ActivityAttempt.user_id",
    )
    assessment_reports = relationship(
        "AssessmentReport",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="AssessmentReport.user_id",
    )
    created_batches = relationship(
        "Batch",
        back_populates="created_by",
        foreign_keys="Batch.created_by_user_id",
    )
    primary_batches = relationship(
        "Batch",
        back_populates="primary_teacher",
        foreign_keys="Batch.primary_teacher_id",
    )
    owned_modules = relationship(
        "Module",
        back_populates="owner_teacher",
        foreign_keys="Module.owner_teacher_id",
    )
    teacher_presence = relationship(
        "TeacherPresence",
        back_populates="teacher",
        cascade="all, delete-orphan",
        uselist=False,
    )
    started_handling_sessions = relationship(
        "TeacherHandlingSession",
        back_populates="teacher",
        foreign_keys="TeacherHandlingSession.teacher_id",
        cascade="all, delete-orphan",
    )
    student_handling_sessions = relationship(
        "TeacherHandlingSession",
        back_populates="student",
        foreign_keys="TeacherHandlingSession.student_id",
    )
    handled_activity_attempts = relationship(
        "ActivityAttempt",
        back_populates="handled_by_teacher",
        foreign_keys="ActivityAttempt.handled_by_teacher_id",
    )
    module_owned_activity_attempts = relationship(
        "ActivityAttempt",
        back_populates="module_owner_teacher",
        foreign_keys="ActivityAttempt.module_owner_teacher_id",
    )
    handled_assessment_reports = relationship(
        "AssessmentReport",
        back_populates="handled_by_teacher",
        foreign_keys="AssessmentReport.handled_by_teacher_id",
    )
    module_owned_assessment_reports = relationship(
        "AssessmentReport",
        back_populates="module_owner_teacher",
        foreign_keys="AssessmentReport.module_owner_teacher_id",
    )
