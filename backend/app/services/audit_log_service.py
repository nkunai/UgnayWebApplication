from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.admin_audit_log import AdminAuditLog
from app.models.user import User


def log_user_activity(
    db: Session,
    *,
    actor: User,
    action_type: str,
    target_type: str,
    target_id: int | None = None,
    details: dict | None = None,
) -> None:
    payload = dict(details or {})
    payload.setdefault("actor_role", actor.role)
    payload.setdefault("actor_email", actor.email)
    payload.setdefault("actor_first_name", actor.first_name)
    payload.setdefault("actor_last_name", actor.last_name)
    payload.setdefault("actor_company_name", actor.company_name)
    db.add(
        AdminAuditLog(
            admin_user_id=actor.id,
            action_type=action_type,
            target_type=target_type,
            target_id=target_id,
            details=payload,
        )
    )
