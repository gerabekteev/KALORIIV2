"""Add ai_provider and ai_model to meals

Revision ID: 0008_add_meal_ai_provider_model
Revises: 0007_add_recipe_ingredients
Create Date: 2026-11-06 09:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0008_add_meal_ai_provider_model"
down_revision: Union[str, None] = "0007_add_recipe_ingredients"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    tables = inspector.get_table_names()
    if "meals" in tables:
        meal_cols = [col["name"] for col in inspector.get_columns("meals")]
        if "ai_provider" not in meal_cols:
            op.add_column(
                "meals",
                sa.Column("ai_provider", sa.String(50), nullable=True),
            )
        if "ai_model" not in meal_cols:
            op.add_column(
                "meals",
                sa.Column("ai_model", sa.String(100), nullable=True),
            )


def downgrade() -> None:
    pass
