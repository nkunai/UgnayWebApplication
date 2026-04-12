"""add company name to user and archived student profiles

Revision ID: 20260411_0005
Revises: 20260410_0004
Create Date: 2026-04-11 16:45:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260411_0005"
down_revision = "20260410_0004"
branch_labels = None
depends_on = None


def _bind():
    return op.get_bind()


def _inspector():
    return sa.inspect(_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in set(_inspector().get_table_names())


def _column_names(table_name: str) -> set[str]:
    if not _table_exists(table_name):
        return set()
    return {column["name"] for column in _inspector().get_columns(table_name)}


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if column.name not in _column_names(table_name):
        op.add_column(table_name, column)


def upgrade() -> None:
    _add_column_if_missing(
        "users",
        sa.Column("company_name", sa.String(length=200), nullable=True),
    )
    if _table_exists("archived_student_accounts"):
        _add_column_if_missing(
            "archived_student_accounts",
            sa.Column("company_name", sa.String(length=200), nullable=True),
        )


def downgrade() -> None:
    if "company_name" in _column_names("archived_student_accounts"):
        op.drop_column("archived_student_accounts", "company_name")
    if "company_name" in _column_names("users"):
        op.drop_column("users", "company_name")
