"""merge company profile and teacher management heads

Revision ID: 20260412_0008
Revises: 20260411_0005, 20260411_0007
Create Date: 2026-04-12 15:43:58.373334

"""
from __future__ import annotations

# revision identifiers, used by Alembic.
revision = '20260412_0008'
down_revision = ('20260411_0005', '20260411_0007')
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Merge revision only; schema changes are defined in parent heads.
    pass


def downgrade() -> None:
    # Downgrade path is controlled by parent revisions.
    pass
