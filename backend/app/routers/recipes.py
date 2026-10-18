from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.recipe import Recipe, RecipeItem
from app.models.product import Product
from app.schemas.recipe import (
    RecipeCreate,
    RecipeUpdate,
    RecipeResponse,
)
from app.services.auth import get_current_user

router = APIRouter(prefix="/recipes", tags=["Рецепты"])


async def calculate_recipe_totals(items_data: list, db: AsyncSession, user_id: int):
    """Calculate total weight and macros from recipe items scoped to accessible products."""
    total_weight = 0.0
    total_cal = 0.0
    total_prot = 0.0
    total_fat = 0.0
    total_carb = 0.0

    items_to_create = []
    for item in items_data:
        prod_result = await db.execute(
            select(Product).where(
                and_(
                    Product.id == item.product_id,
                    or_(Product.is_custom.is_(False), Product.created_by_user_id == user_id),
                )
            )
        )
        product = prod_result.scalar_one_or_none()
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Продукт с ID {item.product_id} не найден или недоступен",
            )

        weight = float(item.weight_grams)
        ratio = weight / 100.0

        total_weight += weight
        total_cal += product.calories_per_100g * ratio
        total_prot += product.protein_per_100g * ratio
        total_fat += product.fat_per_100g * ratio
        total_carb += product.carbs_per_100g * ratio

        items_to_create.append(
            RecipeItem(product_id=product.id, weight_grams=weight)
        )

    return (
        round(total_cal, 1),
        round(total_prot, 1),
        round(total_fat, 1),
        round(total_carb, 1),
        round(total_weight, 1),
        items_to_create,
    )


@router.get("", response_model=List[RecipeResponse])
async def get_recipes(
    favorite_only: Optional[bool] = Query(False, description="Только избранные рецепты"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all recipes created by the current user."""
    conditions = [Recipe.user_id == current_user.id]
    if favorite_only:
        conditions.append(Recipe.is_favorite.is_(True))

    query = (
        select(Recipe)
        .where(and_(*conditions))
        .options(selectinload(Recipe.items).joinedload(RecipeItem.product))
        .order_by(Recipe.is_favorite.desc(), Recipe.created_at.desc())
    )
    result = await db.execute(query)
    recipes = list(result.scalars().all())

    return [RecipeResponse.model_validate(r) for r in recipes]


@router.post("", response_model=RecipeResponse, status_code=status.HTTP_201_CREATED)
async def create_recipe(
    recipe_in: RecipeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new recipe with automatic nutrition calculation."""
    if recipe_in.items:
        (
            total_cal,
            total_prot,
            total_fat,
            total_carb,
            total_weight,
            items,
        ) = await calculate_recipe_totals(recipe_in.items, db, current_user.id)
    elif recipe_in.total_calories is not None:
        total_cal = round(float(recipe_in.total_calories or 0.0), 1)
        total_prot = round(float(recipe_in.total_protein or 0.0), 1)
        total_fat = round(float(recipe_in.total_fat or 0.0), 1)
        total_carb = round(float(recipe_in.total_carbs or 0.0), 1)
        total_weight = round(float(recipe_in.total_weight_grams or 100.0), 1)
        items = []
    else:
        total_cal, total_prot, total_fat, total_carb, total_weight = 0.0, 0.0, 0.0, 0.0, 0.0
        items = []

    recipe = Recipe(
        user_id=current_user.id,
        name=recipe_in.name.strip(),
        description=recipe_in.description,
        total_calories=total_cal,
        total_protein=total_prot,
        total_fat=total_fat,
        total_carbs=total_carb,
        total_weight_grams=total_weight,
        is_favorite=False,
    )
    if recipe_in.ingredients:
        recipe.ingredients = [i.model_dump() for i in recipe_in.ingredients]
    recipe.items = items
    db.add(recipe)
    await db.commit()

    # Reload with relationships
    query = (
        select(Recipe)
        .where(Recipe.id == recipe.id)
        .options(selectinload(Recipe.items).joinedload(RecipeItem.product))
    )
    result = await db.execute(query)
    saved_recipe = result.scalar_one()

    return RecipeResponse.model_validate(saved_recipe)


@router.get("/{recipe_id}", response_model=RecipeResponse)
async def get_recipe(
    recipe_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get recipe by ID."""
    query = (
        select(Recipe)
        .where(and_(Recipe.id == recipe_id, Recipe.user_id == current_user.id))
        .options(selectinload(Recipe.items).joinedload(RecipeItem.product))
    )
    result = await db.execute(query)
    recipe = result.scalar_one_or_none()

    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Рецепт не найден",
        )

    return RecipeResponse.model_validate(recipe)


@router.put("/{recipe_id}", response_model=RecipeResponse)
async def update_recipe(
    recipe_id: int,
    recipe_in: RecipeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a recipe and recompute totals if items changed."""
    query = (
        select(Recipe)
        .where(and_(Recipe.id == recipe_id, Recipe.user_id == current_user.id))
        .options(selectinload(Recipe.items))
    )
    result = await db.execute(query)
    recipe = result.scalar_one_or_none()

    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Рецепт не найден",
        )

    if recipe_in.name is not None:
        recipe.name = recipe_in.name.strip()
    if recipe_in.description is not None:
        recipe.description = recipe_in.description
    if recipe_in.is_favorite is not None:
        recipe.is_favorite = recipe_in.is_favorite
    if recipe_in.ingredients is not None:
        recipe.ingredients = [i.model_dump() for i in recipe_in.ingredients]

    if recipe_in.items is not None:
        # Recompute totals and replace items
        (
            total_cal,
            total_prot,
            total_fat,
            total_carb,
            total_weight,
            new_items,
        ) = await calculate_recipe_totals(recipe_in.items, db, current_user.id)

        recipe.total_calories = total_cal
        recipe.total_protein = total_prot
        recipe.total_fat = total_fat
        recipe.total_carbs = total_carb
        recipe.total_weight_grams = total_weight
        recipe.items = new_items

    await db.commit()

    # Reload with joined products
    reload_query = (
        select(Recipe)
        .where(Recipe.id == recipe.id)
        .options(selectinload(Recipe.items).joinedload(RecipeItem.product))
    )
    reload_result = await db.execute(reload_query)
    updated_recipe = reload_result.scalar_one()

    return RecipeResponse.model_validate(updated_recipe)


@router.put("/{recipe_id}/favorite", response_model=RecipeResponse)
async def toggle_favorite_recipe(
    recipe_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle is_favorite status for a recipe."""
    query = (
        select(Recipe)
        .where(and_(Recipe.id == recipe_id, Recipe.user_id == current_user.id))
        .options(selectinload(Recipe.items).joinedload(RecipeItem.product))
    )
    result = await db.execute(query)
    recipe = result.scalar_one_or_none()

    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Рецепт не найден",
        )

    recipe.is_favorite = not recipe.is_favorite
    await db.commit()

    reload_query = (
        select(Recipe)
        .where(Recipe.id == recipe.id)
        .options(selectinload(Recipe.items).joinedload(RecipeItem.product))
    )
    reload_result = await db.execute(reload_query)
    updated_recipe = reload_result.scalar_one()

    return RecipeResponse.model_validate(updated_recipe)


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recipe(
    recipe_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a recipe."""
    result = await db.execute(
        select(Recipe).where(and_(Recipe.id == recipe_id, Recipe.user_id == current_user.id))
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Рецепт не найден",
        )

    await db.delete(recipe)
    await db.commit()
    return None
