"""Add ingredients_json to meals table

Revision ID: 0004_add_meal_ingredients
Revises: 0003_add_barcode_and_scanned_products
Create Date: 2026-10-16 08:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004_add_meal_ingredients"
down_revision: Union[str, None] = "0003_add_barcode_and_scanned_products"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    meal_columns = [col["name"] for col in inspector.get_columns("meals")]

    if "ingredients_json" not in meal_columns:
        op.add_column("meals", sa.Column("ingredients_json", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    meal_columns = [col["name"] for col in inspector.get_columns("meals")]

    if "ingredients_json" in meal_columns:
        op.drop_column("meals", "ingredients_json")
