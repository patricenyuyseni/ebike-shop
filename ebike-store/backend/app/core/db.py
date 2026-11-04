from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


SessionLocal = sessionmaker(autoflush=False, expire_on_commit=False)
_engine = None


def init_engine(url: str):
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = create_engine(url, pool_pre_ping=True, pool_size=10, max_overflow=10)
    SessionLocal.configure(bind=_engine)
    return _engine


def get_engine():
    return _engine


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
