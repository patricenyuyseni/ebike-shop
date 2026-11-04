import os
from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import settings
from app.core.db import Base
import app.models  # noqa: F401  (registers all tables)

config = context.config
target_metadata = Base.metadata


def db_url() -> str:
    url = os.environ.get("ALEMBIC_DATABASE_URL") or settings.database_url
    if not url:
        raise SystemExit("DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.")
    return url


def run_migrations_online() -> None:
    engine = create_engine(db_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
