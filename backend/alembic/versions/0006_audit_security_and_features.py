"""Add timezone, token_version to users and is_honest_sign to user_scanned_products

Revision ID: 0006_audit_security_and_features
Revises: 0005_add_meal_plans_and_telegram
Create Date: 2026-10-16 21:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0006_audit_security_and_features"
down_revision: Union[str, None] = "0005_add_meal_plans_and_telegram"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    user_cols = [col["name"] for col in inspector.get_columns("users")]
    if "timezone" not in user_cols:
        op.add_column(
            "users",
            sa.Column("timezone", sa.String(length=64), server_default="Europe/Moscow", nullable=False),
        )
    if "token_version" not in user_cols:
        op.add_column(
            "users",
            sa.Column("token_version", sa.Integer(), server_default="1", nullable=False),
        )

    tables = inspector.get_table_names()
    if "user_scanned_products" in tables:
        scanned_cols = [col["name"] for col in inspector.get_columns("user_scanned_products")]
        if "is_honest_sign" not in scanned_cols:
            op.add_column(
                "user_scanned_products",
                sa.Column("is_honest_sign", sa.Boolean(), server_default="0", nullable=False),
            )


def downgrade() -> None:
    pass
