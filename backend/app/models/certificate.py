from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CertificateTemplate(Base):
    __tablename__ = "certificate_templates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    section_id: Mapped[int] = mapped_column(
        ForeignKey("sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploaded_by_teacher_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    review_remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    section = relationship("Section", back_populates="certificate_templates")
    uploaded_by_teacher = relationship("User", foreign_keys=[uploaded_by_teacher_id])
    approved_by = relationship("User", foreign_keys=[approved_by_user_id])
    issued_certificates = relationship(
        "IssuedCertificate",
        back_populates="template",
        cascade="all, delete-orphan",
    )


class IssuedCertificate(Base):
    __tablename__ = "issued_certificates"
    __table_args__ = (
        UniqueConstraint("template_id", "student_id", name="uq_issued_certificate_student_template"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    template_id: Mapped[int] = mapped_column(
        ForeignKey("certificate_templates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    section_id: Mapped[int] = mapped_column(
        ForeignKey("sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    template = relationship("CertificateTemplate", back_populates="issued_certificates")
    section = relationship("Section")
    student = relationship("User", foreign_keys=[student_id])
