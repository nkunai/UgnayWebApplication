from contextlib import asynccontextmanager
import logging
from pathlib import Path
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import (
    admin_lms,
    auth,
    health,
    lab,
    modules,
    progress,
    registrations,
    student_lms,
    teacher_enrollment,
    teacher_lms,
    teacher_reports,
)
from app.db.init_db import init_db
from app.services.alphabet_model import get_alphabet_model_service
from app.services.numbers_model import get_numbers_model_service
from app.services.words_model import get_words_model_service


logger = logging.getLogger(__name__)


def warm_lab_models() -> None:
    checks = (
        ("alphabet", get_alphabet_model_service),
        ("numbers", get_numbers_model_service),
        ("words", get_words_model_service),
    )
    for label, service_getter in checks:
        try:
            status = service_getter().status()
            logger.info(
                "Lab model warm-up: %s ready=%s model_found=%s path=%s",
                label,
                status.get("ready"),
                status.get("model_found"),
                status.get("model_path"),
            )
        except Exception:
            logger.exception("Lab model warm-up failed for %s.", label)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    threading.Thread(target=warm_lab_models, name="lab-model-warmup", daemon=True).start()
    yield


app = FastAPI(title="FSL Learning Hub API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=(
        r"^https?://("
        r"localhost|127\.0\.0\.1|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
        r")(:\d+)?$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(admin_lms.router, prefix="/api")
app.include_router(teacher_lms.router, prefix="/api")
app.include_router(teacher_enrollment.router, prefix="/api")
app.include_router(teacher_reports.router, prefix="/api")
app.include_router(student_lms.router, prefix="/api")
app.include_router(registrations.router, prefix="/api")
app.include_router(modules.router, prefix="/api")
app.include_router(progress.router, prefix="/api")
app.include_router(lab.router, prefix="/api")

uploads_root = (Path(__file__).resolve().parents[1] / "uploads").resolve()
uploads_root.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_root), name="uploads")
