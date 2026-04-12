from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ArchivedStudentAccount(Base):
    __tablename__ = "archived_student_accounts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    original_user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    original_username: Mapped[str] = mapped_column(String(120), nullable=False)
    original_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    middle_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    company_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    profile_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="student")
    enrollment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    registration_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    batch_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    archive_reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    archived_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
