from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SectionModuleProgress(Base):
    __tablename__ = "section_module_progress"
    __table_args__ = (
        UniqueConstraint("student_id", "section_module_id", name="uq_section_module_progress"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    section_module_id: Mapped[int] = mapped_column(
        ForeignKey("section_modules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="locked")
    progress_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_completed_item_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    student = relationship("User", foreign_keys=[student_id])
    module = relationship("SectionModule", back_populates="progress_entries")


class SectionModuleItemProgress(Base):
    __tablename__ = "section_module_item_progress"
    __table_args__ = (
        UniqueConstraint("student_id", "section_module_item_id", name="uq_section_module_item_progress"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    section_module_id: Mapped[int] = mapped_column(
        ForeignKey("section_modules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    section_module_item_id: Mapped[int] = mapped_column(
        ForeignKey("section_module_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="not_started")
    response_text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_correct: Mapped[bool | None] = mapped_column(nullable=True)
    score_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    submitted_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    student = relationship("User", foreign_keys=[student_id])
    module_item = relationship("SectionModuleItem", back_populates="progress_entries")
