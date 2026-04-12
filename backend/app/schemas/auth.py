from datetime import date, datetime
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

EMAIL_PATTERN = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
PHONE_PATTERN = re.compile(r"^09\d{9}$")
PASSWORD_PATTERN = re.compile(r"^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$")


def _normalize_phone(value: str) -> str:
    return re.sub(r"\D+", "", value)


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=8, max_length=120)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not PASSWORD_PATTERN.match(value):
            raise ValueError(
                "Password must be at least 8 characters and include 1 uppercase letter, 1 number, and 1 symbol."
            )
        return value


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    company_name: str | None = None
    email: str | None = None
    phone_number: str | None = None
    address: str | None = None
    birth_date: date | None = None
    profile_image_path: str | None = None
    must_change_password: bool = False
    role: Literal["student", "teacher", "admin"] = "student"


class UserProfileUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=120)
    middle_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    company_name: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=255)
    phone_number: str | None = Field(default=None, max_length=40)
    address: str | None = Field(default=None, max_length=1000)
    birth_date: date | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        if not EMAIL_PATTERN.match(trimmed):
            raise ValueError(
                "Email must be in a valid format (example: name@gmail.com, name@hotmail.com, name@yahoo.com)."
            )
        return trimmed.lower()

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = _normalize_phone(value)
        if not normalized:
            return None
        if not PHONE_PATTERN.match(normalized):
            raise ValueError(
                "Phone number must start with 09 and contain exactly 11 digits (example: 09123456789)."
            )
        return normalized


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=120)
    new_password: str = Field(min_length=8, max_length=120)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not PASSWORD_PATTERN.match(value):
            raise ValueError(
                "New password must be at least 8 characters and include 1 uppercase letter, 1 number, and 1 symbol."
            )
        return value


class ForgotPasswordRequest(BaseModel):
    username_or_email: str = Field(min_length=1, max_length=255)

    @field_validator("username_or_email")
    @classmethod
    def validate_identity(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Username or email is required.")
        return trimmed


class ForgotPasswordVerifyRequest(BaseModel):
    username_or_email: str = Field(min_length=1, max_length=255)
    otp_code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=120)

    @field_validator("username_or_email")
    @classmethod
    def validate_identity(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Username or email is required.")
        return trimmed

    @field_validator("otp_code")
    @classmethod
    def validate_otp_code(cls, value: str) -> str:
        trimmed = value.strip()
        if not re.fullmatch(r"\d{6}", trimmed):
            raise ValueError("OTP code must be a 6-digit number.")
        return trimmed

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not PASSWORD_PATTERN.match(value):
            raise ValueError(
                "New password must be at least 8 characters and include 1 uppercase letter, 1 number, and 1 symbol."
            )
        return value


class ForgotPasswordConfirmOtpRequest(BaseModel):
    username_or_email: str = Field(min_length=1, max_length=255)
    otp_code: str = Field(min_length=6, max_length=6)

    @field_validator("username_or_email")
    @classmethod
    def validate_identity(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Username or email is required.")
        return trimmed

    @field_validator("otp_code")
    @classmethod
    def validate_otp_code(cls, value: str) -> str:
        trimmed = value.strip()
        if not re.fullmatch(r"\d{6}", trimmed):
            raise ValueError("OTP code must be a 6-digit number.")
        return trimmed


class ForgotPasswordConfirmOtpResponse(BaseModel):
    message: str
    reset_token: str


class ForgotPasswordResetRequest(BaseModel):
    reset_token: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=8, max_length=120)

    @field_validator("reset_token")
    @classmethod
    def validate_reset_token(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Reset token is required.")
        return trimmed

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not PASSWORD_PATTERN.match(value):
            raise ValueError(
                "New password must be at least 8 characters and include 1 uppercase letter, 1 number, and 1 symbol."
            )
        return value


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class UserSelfArchiveResponse(BaseModel):
    message: str


class TeacherInviteVerifyQrRequest(BaseModel):
    qr_payload: str = Field(min_length=1, max_length=2048)


class TeacherInviteVerifyQrResponse(BaseModel):
    invite_code: str
    label: str | None = None
    expires_at: datetime | None = None
    remaining_uses: int | None = None
    message: str


class TeacherInviteVerifyPasskeyRequest(BaseModel):
    invite_code: str = Field(min_length=1, max_length=120)
    passkey: str = Field(min_length=4, max_length=120)


class TeacherInviteVerifyPasskeyResponse(BaseModel):
    onboarding_token: str
    expires_at: datetime | None = None
    remaining_uses: int | None = None
    message: str


class TeacherInviteIssueCredentialsRequest(BaseModel):
    onboarding_token: str = Field(min_length=1, max_length=4096)
    email: str = Field(min_length=5, max_length=255)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        trimmed = value.strip().lower()
        if not EMAIL_PATTERN.match(trimmed):
            raise ValueError(
                "Email must be in a valid format (example: name@gmail.com, name@hotmail.com, name@yahoo.com)."
            )
        return trimmed


class TeacherInviteIssueCredentialsResponse(BaseModel):
    message: str
    username: str


class TeacherInviteRevokeRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)
