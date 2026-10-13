"""Add user ai_settings_json column

Revision ID: 0002_add_user_ai_settings
Revises: 0001_initial
Create Date: 2026-10-13 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002_add_user_ai_settings"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ai_settings_json", sa.String(length=4000), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "ai_settings_json")
