from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Category
from schemas import CategoryCreate
from dependencies import get_current_user, get_vault_key
from models import UserProfile

router = APIRouter(prefix="/api")


@router.get("/categories")
async def list_categories(
    db: Session = Depends(get_db),
    vault_key: bytes = Depends(get_vault_key),
    user: UserProfile = Depends(get_current_user),
):
    return db.query(Category).filter(Category.user_id == user.id).order_by(Category.name).all()


@router.post("/categories", status_code=201)
async def create_category(
    body: CategoryCreate,
    db: Session = Depends(get_db),
    vault_key: bytes = Depends(get_vault_key),
    user: UserProfile = Depends(get_current_user),
):
    existing = db.query(Category).filter(Category.user_id == user.id, Category.name == body.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Category already exists")
    cat = Category(user_id=user.id, name=body.name)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/categories/{cat_id}")
async def update_category(
    cat_id: str,
    body: CategoryCreate,
    db: Session = Depends(get_db),
    vault_key: bytes = Depends(get_vault_key),
    user: UserProfile = Depends(get_current_user),
):
    cat = db.query(Category).filter(Category.id == cat_id, Category.user_id == user.id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.name = body.name
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}", status_code=204)
async def delete_category(
    cat_id: str,
    db: Session = Depends(get_db),
    vault_key: bytes = Depends(get_vault_key),
    user: UserProfile = Depends(get_current_user),
):
    cat = db.query(Category).filter(Category.id == cat_id, Category.user_id == user.id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
