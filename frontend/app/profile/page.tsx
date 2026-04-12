"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

import {
  ApiUser,
  changeMyPassword,
  getCurrentUser,
  resolveUploadsBase,
  unenrollMyAccount,
  updateMyProfile,
  uploadMyProfilePhoto
} from "@/lib/api";
import {
  isStrongPassword,
  isValidEmail,
  isValidPhilippinePhone,
  normalizePhilippinePhone
} from "@/lib/validation";
import { useAuth } from "@/components/auth-context";

type ProfileForm = {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  address: string;
  birthDate: string;
};

const EMPTY_PROFILE: ProfileForm = {
  firstName: "",
  middleName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  address: "",
  birthDate: ""
};

export default function ProfilePage() {
  const { clearMustChangePassword } = useAuth();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const profileImageUrl = useMemo(() => {
    if (!user?.profile_image_path) {
      return null;
    }
    const uploadBase = resolveUploadsBase();
    return `${uploadBase}/${user.profile_image_path}`;
  }, [user?.profile_image_path]);

  const canEditNames = user?.role === "teacher";

  useEffect(() => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) {
      setError("Not logged in.");
      return;
    }

    setLoading(true);
    setError(null);
    getCurrentUser(token)
      .then((data) => {
        setUser(data);
        setForm({
          firstName: data.first_name ?? "",
          middleName: data.middle_name ?? "",
          lastName: data.last_name ?? "",
          email: data.email ?? "",
          phoneNumber: data.phone_number ?? "",
          address: data.address ?? "",
          birthDate: data.birth_date ?? ""
        });
      })
      .catch((requestError: Error) => {
        setError(requestError.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (user.must_change_password) {
      setShowPasswordDialog(true);
    }
  }, [user]);

  function updateField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = form.email.trim();
    const phone = normalizePhilippinePhone(form.phoneNumber);

    if (email && !isValidEmail(email)) {
      setError(
        "Email must be valid (example: name@gmail.com, name@hotmail.com, name@yahoo.com)."
      );
      return;
    }
    if (phone && !isValidPhilippinePhone(phone)) {
      setError("Phone number must start with 09 and contain exactly 11 digits (example: 09123456789).");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateMyProfile({
        first_name: form.firstName.trim() || null,
        middle_name: form.middleName.trim() || null,
        last_name: form.lastName.trim() || null,
        email: email || null,
        phone_number: phone || null,
        address: form.address.trim() || null,
        birth_date: form.birthDate.trim() || null
      });
      setUser(updated);
      setSuccess("Profile updated successfully.");
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Failed to update profile.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function onPhotoSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setPhotoFile(file);
    setPendingPhotoFile(file);
  }

  async function uploadPhoto(file: File) {
    if (!file) {
      return;
    }
    setPhotoUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await uploadMyProfilePhoto(file);
      setUser(updated);
      setPhotoFile(null);
      setPendingPhotoFile(null);
      setSuccess("Profile photo updated successfully.");
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Failed to upload photo.";
      setError(message);
    } finally {
      setPhotoUploading(false);
    }
  }

  async function savePassword() {
    if (!isStrongPassword(newPassword)) {
      setError(
        "New password must be at least 8 characters with 1 uppercase letter, 1 number, and 1 symbol."
      );
      return;
    }
    setPasswordSaving(true);
    setError(null);
    setPasswordMessage(null);

    try {
      const response = await changeMyPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setPasswordMessage(response.message);
      setUser((prev) => (prev ? { ...prev, must_change_password: false } : prev));
      clearMustChangePassword();
      setShowPasswordDialog(false);
    } catch (passwordError) {
      const message =
        passwordError instanceof Error ? passwordError.message : "Failed to update password.";
      setError(message);
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleUnenroll() {
    if (user?.role !== "student") {
      return;
    }
    if (
      !window.confirm(
        "This will unenroll your student account, move it to archive, and log you out. Continue?"
      )
    ) {
      return;
    }

    setUnenrolling(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await unenrollMyAccount();
      window.localStorage.removeItem("auth_token");
      window.localStorage.removeItem("auth_username");
      window.alert(response.message);
      window.location.href = "/";
    } catch (unenrollError) {
      const message =
        unenrollError instanceof Error ? unenrollError.message : "Failed to unenroll account.";
      setError(message);
    } finally {
      setUnenrolling(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="panel panel-lively">
        <h2 className="text-2xl font-semibold title-gradient">My Profile</h2>
        <p className="mt-2 text-sm text-muted">
          Edit your personal info, contact details, password, and profile picture.
        </p>
      </div>

      {loading ? (
        <div className="panel">
          <p className="text-sm text-muted">Loading profile...</p>
        </div>
      ) : null}

      {!loading && user ? (
        <>
          <div className="panel panel-lively">
            <p className="text-xs uppercase tracking-wider label-accent">Profile Picture</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {profileImageUrl ? (
                <img
                  alt="Profile"
                  className="h-20 w-20 rounded-full border border-brandBorder object-cover"
                  src={profileImageUrl}
                />
              ) : (
                <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-brandBlue text-2xl font-bold text-white">
                  {user.username.charAt(0).toUpperCase()}
                </span>
              )}

              <div className="space-y-2">
                <label className="inline-flex cursor-pointer items-center rounded-lg bg-brandBlue px-3 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90">
                  Select Photo
                  <input
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={onPhotoSelect}
                    type="file"
                  />
                </label>
                <p className="text-xs text-muted">
                  {photoFile ? `Selected: ${photoFile.name}` : "No new photo selected"}
                </p>
                {photoUploading ? <p className="text-xs text-brandBlue">Uploading photo...</p> : null}
              </div>
            </div>
          </div>

          <form className="panel panel-lively space-y-4" onSubmit={saveProfile}>
            <p className="text-xs uppercase tracking-wider label-accent">Personal Information</p>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm font-semibold text-slate-800">
                First Name
                <input
                  className={`w-full rounded-lg border border-brandBorder px-3 py-2 text-sm text-slate-900 ${
                    canEditNames
                      ? "bg-white outline-none transition focus:border-brandBlue"
                      : "bg-brandMutedSurface"
                  }`}
                  onChange={(event) => updateField("firstName", event.target.value)}
                  readOnly={!canEditNames}
                  type="text"
                  value={form.firstName}
                />
              </label>
              <label className="space-y-1 text-sm font-semibold text-slate-800">
                Middle Name
                <input
                  className={`w-full rounded-lg border border-brandBorder px-3 py-2 text-sm text-slate-900 ${
                    canEditNames
                      ? "bg-white outline-none transition focus:border-brandBlue"
                      : "bg-brandMutedSurface"
                  }`}
                  onChange={(event) => updateField("middleName", event.target.value)}
                  readOnly={!canEditNames}
                  type="text"
                  value={form.middleName}
                />
              </label>
              <label className="space-y-1 text-sm font-semibold text-slate-800">
                Last Name
                <input
                  className={`w-full rounded-lg border border-brandBorder px-3 py-2 text-sm text-slate-900 ${
                    canEditNames
                      ? "bg-white outline-none transition focus:border-brandBlue"
                      : "bg-brandMutedSurface"
                  }`}
                  onChange={(event) => updateField("lastName", event.target.value)}
                  readOnly={!canEditNames}
                  type="text"
                  value={form.lastName}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm font-semibold text-slate-800">
                Email
                <input
                  className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                  onChange={(event) => updateField("email", event.target.value)}
                  pattern="^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"
                  type="email"
                  value={form.email}
                />
              </label>
              <label className="space-y-1 text-sm font-semibold text-slate-800">
                Phone Number
                <input
                  className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                  autoComplete="tel-national"
                  inputMode="numeric"
                  maxLength={11}
                  onChange={(event) => updateField("phoneNumber", normalizePhilippinePhone(event.target.value))}
                  pattern="09[0-9]{9}"
                  placeholder="09XXXXXXXXX"
                  type="text"
                  value={form.phoneNumber}
                />
                <p className="text-xs text-muted">Format: `09XXXXXXXXX` (must start with 09 and be 11 digits)</p>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm font-semibold text-slate-800">
                Birth Date
                <input
                  className="w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                  onChange={(event) => updateField("birthDate", event.target.value)}
                  type="date"
                  value={form.birthDate}
                />
              </label>
              <label className="space-y-1 text-sm font-semibold text-slate-800">
                Username
                <input
                  className="w-full rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-sm text-slate-700"
                  disabled
                  type="text"
                  value={user.username}
                />
              </label>
            </div>

            <label className="space-y-1 text-sm font-semibold text-slate-800">
              Address
              <textarea
                className="min-h-20 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                onChange={(event) => updateField("address", event.target.value)}
                value={form.address}
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                type="submit"
              >
                {saving ? "Saving..." : "Save Profile"}
              </button>
              <button
                className="rounded-lg border border-brandBorder bg-brandMutedSurface px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                onClick={() => {
                  setError(null);
                  setPasswordMessage(null);
                  setShowPasswordDialog(true);
                }}
                type="button"
              >
                Change Password
              </button>
              {user.role === "student" ? (
                <button
                  className="ml-auto rounded-lg border border-brandRed bg-white px-4 py-2 text-sm font-semibold text-brandRed transition hover:bg-brandRedLight disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={unenrolling}
                  onClick={() => {
                    void handleUnenroll();
                  }}
                  type="button"
                >
                  {unenrolling ? "Unenrolling..." : "Unenroll Account"}
                </button>
              ) : null}
            </div>
          </form>
        </>
      ) : null}

      {pendingPhotoFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brandNavy/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-brandBorder bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Upload Selected Photo</h3>
            <p className="mt-2 text-sm text-slate-700">
              Selected file: <span className="font-semibold">{pendingPhotoFile.name}</span>
            </p>
            <p className="mt-1 text-sm text-slate-600">Click Open to upload now.</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-brandMutedSurface"
                onClick={() => setPendingPhotoFile(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={photoUploading}
                onClick={() => {
                  void uploadPhoto(pendingPhotoFile);
                }}
                type="button"
              >
                {photoUploading ? "Uploading..." : "Open"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPasswordDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brandNavy/45 px-4">
          <form
            className="w-full max-w-lg rounded-2xl border border-brandBorder bg-white p-5 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              void savePassword();
            }}
          >
            <h3 className="text-lg font-semibold text-slate-900">Change Password</h3>
            {user?.must_change_password ? (
              <p className="mt-2 rounded-lg border border-brandYellow/35 bg-brandYellowLight px-3 py-2 text-sm text-slate-700">
                Your account is using an initial password. Please change it now.
              </p>
            ) : null}

            <div className="mt-4 grid gap-3">
              <label className="space-y-1 text-sm font-semibold text-slate-800">
                Current Password
                <div className="flex items-center gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    required
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                  />
                  <button
                    className="rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                    onClick={() => setShowCurrentPassword((value) => !value)}
                    type="button"
                  >
                    {showCurrentPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <label className="space-y-1 text-sm font-semibold text-slate-800">
                New Password
                <div className="flex items-center gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      setError(null);
                    }}
                    required
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                  />
                  <button
                    className="rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                    onClick={() => setShowNewPassword((value) => !value)}
                    type="button"
                  >
                    {showNewPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="text-xs text-muted">
                  At least 8 chars, 1 uppercase, 1 number, and 1 symbol.
                </p>
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-brandMutedSurface"
                onClick={() => {
                  setShowPasswordDialog(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setShowCurrentPassword(false);
                  setShowNewPassword(false);
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-brandRed px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandRed/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={passwordSaving}
                type="submit"
              >
                {passwordSaving ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {success ? (
        <p className="rounded-lg border border-brandGreen/30 bg-brandGreenLight px-3 py-2 text-sm text-slate-700">
          {success}
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600">Error: {error}</p> : null}
    </section>
  );
}
