"""Add meal_plans table and telegram columns to users

Revision ID: 0005_add_meal_plans_and_telegram
Revises: 0004_add_meal_ingredients
Create Date: 2026-10-16 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0005_add_meal_plans_and_telegram"
down_revision: Union[str, None] = "0004_add_meal_ingredients"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    user_cols = [col["name"] for col in inspector.get_columns("users")]
    if "telegram_chat_id" not in user_cols:
        op.add_column("users", sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True))
    if "telegram_username" not in user_cols:
        op.add_column("users", sa.Column("telegram_username", sa.String(length=100), nullable=True))
    if "telegram_link_code" not in user_cols:
        op.add_column("users", sa.Column("telegram_link_code", sa.String(length=64), nullable=True))
    if "telegram_link_expires_at" not in user_cols:
        op.add_column("users", sa.Column("telegram_link_expires_at", sa.DateTime(), nullable=True))

    tables = inspector.get_table_names()
    if "meal_plans" not in tables:
        op.create_table(
            "meal_plans",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("plan_date", sa.Date(), nullable=False),
            sa.Column("meals_count", sa.Integer(), server_default="3", nullable=False),
            sa.Column("target_calories", sa.Float(), nullable=False),
            sa.Column("target_protein", sa.Float(), nullable=False),
            sa.Column("target_fat", sa.Float(), nullable=False),
            sa.Column("target_carbs", sa.Float(), nullable=False),
            sa.Column("user_preferences", sa.String(length=500), nullable=True),
            sa.Column("meals_json", sa.Text(), server_default="[]", nullable=False),
            sa.Column("provider_used", sa.String(length=100), nullable=True),
            sa.Column("model_used", sa.String(length=150), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "plan_date", name="uq_meal_plans_user_date"),
        )
        op.create_index(op.f("ix_meal_plans_id"), "meal_plans", ["id"], unique=False)
        op.create_index(op.f("ix_meal_plans_user_id"), "meal_plans", ["user_id"], unique=False)
        op.create_index(op.f("ix_meal_plans_plan_date"), "meal_plans", ["plan_date"], unique=False)


def downgrade() -> None:
    op.drop_table("meal_plans")
