"""Initial migration creating all tables

Revision ID: 0001_initial
Revises: 
Create Date: 2026-10-13 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users table
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("height_cm", sa.Float(), nullable=True),
        sa.Column("current_weight_kg", sa.Float(), nullable=True),
        sa.Column("target_weight_kg", sa.Float(), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("gender", sa.String(length=20), nullable=True),
        sa.Column("activity_level", sa.String(length=50), nullable=True),
        sa.Column("daily_calories_goal", sa.Integer(), server_default="2000", nullable=False),
        sa.Column("daily_protein_goal", sa.Integer(), server_default="140", nullable=False),
        sa.Column("daily_fat_goal", sa.Integer(), server_default="70", nullable=False),
        sa.Column("daily_carbs_goal", sa.Integer(), server_default="250", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    # 2. weight_log table
    op.create_table(
        "weight_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=False),
        sa.Column("log_date", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_weight_log_id"), "weight_log", ["id"], unique=False)
    op.create_index(op.f("ix_weight_log_user_id"), "weight_log", ["user_id"], unique=False)
    op.create_index(op.f("ix_weight_log_log_date"), "weight_log", ["log_date"], unique=False)

    # 3. meals table
    op.create_table(
        "meals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("calories", sa.Float(), nullable=False),
        sa.Column("protein", sa.Float(), nullable=False),
        sa.Column("fat", sa.Float(), nullable=False),
        sa.Column("carbs", sa.Float(), nullable=False),
        sa.Column("weight_grams", sa.Float(), server_default="0", nullable=True),
        sa.Column("photo_path", sa.String(length=500), nullable=True),
        sa.Column("user_comment", sa.String(length=500), nullable=True),
        sa.Column("ai_raw_response", sa.Text(), nullable=True),
        sa.Column("is_manually_edited", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.Column("meal_date", sa.Date(), nullable=False),
        sa.Column("meal_time", sa.Time(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_meals_id"), "meals", ["id"], unique=False)
    op.create_index(op.f("ix_meals_user_id"), "meals", ["user_id"], unique=False)
    op.create_index(op.f("ix_meals_meal_date"), "meals", ["meal_date"], unique=False)

    # 4. products table
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("calories_per_100g", sa.Float(), nullable=False),
        sa.Column("protein_per_100g", sa.Float(), nullable=False),
        sa.Column("fat_per_100g", sa.Float(), nullable=False),
        sa.Column("carbs_per_100g", sa.Float(), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("is_custom", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_products_id"), "products", ["id"], unique=False)
    op.create_index(op.f("ix_products_name"), "products", ["name"], unique=False)
    op.create_index(op.f("ix_products_created_by_user_id"), "products", ["created_by_user_id"], unique=False)

    # 5. recipes table
    op.create_table(
        "recipes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("total_calories", sa.Float(), server_default="0", nullable=False),
        sa.Column("total_protein", sa.Float(), server_default="0", nullable=False),
        sa.Column("total_fat", sa.Float(), server_default="0", nullable=False),
        sa.Column("total_carbs", sa.Float(), server_default="0", nullable=False),
        sa.Column("total_weight_grams", sa.Float(), server_default="0", nullable=False),
        sa.Column("is_favorite", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_recipes_id"), "recipes", ["id"], unique=False)
    op.create_index(op.f("ix_recipes_user_id"), "recipes", ["user_id"], unique=False)

    # 6. recipe_items table
    op.create_table(
        "recipe_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("weight_grams", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_recipe_items_id"), "recipe_items", ["id"], unique=False)
    op.create_index(op.f("ix_recipe_items_recipe_id"), "recipe_items", ["recipe_id"], unique=False)
    op.create_index(op.f("ix_recipe_items_product_id"), "recipe_items", ["product_id"], unique=False)


def downgrade() -> None:
    op.drop_table("recipe_items")
    op.drop_table("recipes")
    op.drop_table("products")
    op.drop_table("meals")
    op.drop_table("weight_log")
    op.drop_table("users")
