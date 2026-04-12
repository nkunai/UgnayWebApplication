from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SectionModule(Base):
    __tablename__ = "section_modules"
    __table_args__ = (
        UniqueConstraint("section_id", "order_index", name="uq_section_module_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    section_id: Mapped[int] = mapped_column(
        ForeignKey("sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by_teacher_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    section = relationship("Section", back_populates="modules")
    created_by_teacher = relationship("User", foreign_keys=[created_by_teacher_id])
    items = relationship(
        "SectionModuleItem",
        back_populates="module",
        cascade="all, delete-orphan",
        order_by="SectionModuleItem.order_index.asc()",
    )
    progress_entries = relationship(
        "SectionModuleProgress",
        back_populates="module",
        cascade="all, delete-orphan",
    )


class SectionModuleItem(Base):
    __tablename__ = "section_module_items"
    __table_args__ = (
        UniqueConstraint("section_module_id", "order_index", name="uq_section_module_item_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    section_module_id: Mapped[int] = mapped_column(
        ForeignKey("section_modules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    item_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    module = relationship("SectionModule", back_populates="items")
    progress_entries = relationship(
        "SectionModuleItemProgress",
        back_populates="module_item",
        cascade="all, delete-orphan",
    )
