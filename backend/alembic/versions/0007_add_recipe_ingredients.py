"""Add ingredients_json to recipes

Revision ID: 0007_add_recipe_ingredients
Revises: 0006_audit_security_and_features
Create Date: 2026-10-18 17:55:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0007_add_recipe_ingredients"
down_revision: Union[str, None] = "0006_audit_security_and_features"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    tables = inspector.get_table_names()
    if "recipes" in tables:
        recipe_cols = [col["name"] for col in inspector.get_columns("recipes")]
        if "ingredients_json" not in recipe_cols:
            op.add_column(
                "recipes",
                sa.Column("ingredients_json", sa.Text(), nullable=True),
            )


def downgrade() -> None:
    pass
