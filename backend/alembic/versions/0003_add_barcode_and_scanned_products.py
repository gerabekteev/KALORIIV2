"""Add barcode columns to products and create user_scanned_products table

Revision ID: 0003_add_barcode_and_scanned_products
Revises: 0002_add_user_ai_settings
Create Date: 2026-10-13 14:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003_add_barcode_and_scanned_products"
down_revision: Union[str, None] = "0002_add_user_ai_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    prod_columns = [col["name"] for col in inspector.get_columns("products")]

    if "barcode" not in prod_columns:
        op.add_column("products", sa.Column("barcode", sa.String(length=100), nullable=True))
    if "brand" not in prod_columns:
        op.add_column("products", sa.Column("brand", sa.String(length=255), nullable=True))
    if "image_url" not in prod_columns:
        op.add_column("products", sa.Column("image_url", sa.String(length=500), nullable=True))
    if "package_weight_grams" not in prod_columns:
        op.add_column("products", sa.Column("package_weight_grams", sa.Float(), nullable=True, server_default="100.0"))

    try:
        op.create_index(op.f("ix_products_barcode"), "products", ["barcode"], unique=False)
    except Exception:
        pass

    tables = inspector.get_table_names()
    if "user_scanned_products" not in tables:
        op.create_table(
            "user_scanned_products",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("product_id", sa.Integer(), nullable=False),
            sa.Column("barcode", sa.String(length=100), nullable=True),
            sa.Column("last_scanned_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("scan_count", sa.Integer(), server_default="1", nullable=False),
            sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        try:
            op.create_index(op.f("ix_user_scanned_products_id"), "user_scanned_products", ["id"], unique=False)
            op.create_index(op.f("ix_user_scanned_products_user_id"), "user_scanned_products", ["user_id"], unique=False)
            op.create_index(op.f("ix_user_scanned_products_product_id"), "user_scanned_products", ["product_id"], unique=False)
            op.create_index(op.f("ix_user_scanned_products_barcode"), "user_scanned_products", ["barcode"], unique=False)
        except Exception:
            pass


def downgrade() -> None:
    op.drop_table("user_scanned_products")
    # SQLite has limited drop_column support
