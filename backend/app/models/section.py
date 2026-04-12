from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Section(Base):
    __tablename__ = "sections"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active", server_default="active"
    )
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    created_by = relationship("User", foreign_keys=[created_by_user_id])
    teachers = relationship(
        "SectionTeacherAssignment",
        back_populates="section",
        cascade="all, delete-orphan",
    )
    students = relationship(
        "SectionStudentAssignment",
        back_populates="section",
        cascade="all, delete-orphan",
    )
    modules = relationship(
        "SectionModule",
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="SectionModule.order_index.asc()",
    )
    certificate_templates = relationship(
        "CertificateTemplate",
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="CertificateTemplate.created_at.desc()",
    )


class SectionTeacherAssignment(Base):
    __tablename__ = "section_teacher_assignments"
    __table_args__ = (
        UniqueConstraint("section_id", "teacher_id", name="uq_section_teacher_assignment"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    section_id: Mapped[int] = mapped_column(
        ForeignKey("sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    section = relationship("Section", back_populates="teachers")
    teacher = relationship("User", foreign_keys=[teacher_id])


class SectionStudentAssignment(Base):
    __tablename__ = "section_student_assignments"
    __table_args__ = (
        UniqueConstraint("section_id", "student_id", name="uq_section_student_assignment"),
        UniqueConstraint("student_id", name="uq_student_single_section"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    section_id: Mapped[int] = mapped_column(
        ForeignKey("sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    course_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    auto_archive_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    section = relationship("Section", back_populates="students")
    student = relationship("User", foreign_keys=[student_id])
