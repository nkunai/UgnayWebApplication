"use client";

import { FormEvent, useEffect, useState } from "react";

import { assignSectionMembers, createAdminSection, getAdminSections, getAdminUsers, type LmsSection } from "@/lib/api";

export default function AdminSectionsPage() {
  const [sections, setSections] = useState<LmsSection[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [sectionData, studentData] = await Promise.all([
      getAdminSections(),
      getAdminUsers("student")
    ]);
    setSections(sectionData);
    setStudents(studentData);
  }

  useEffect(() => {
    void refresh().catch((requestError: Error) => setError(requestError.message));
  }, []);

  async function onCreateSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createAdminSection({ code, name, description });
      setCode("");
      setName("");
      setDescription("");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create section.");
    }
  }

  async function onAssignMembers() {
    if (!selectedSectionId) {
      setError("Choose a section first.");
      return;
    }
    setError(null);
    try {
      await assignSectionMembers(Number(selectedSectionId), {
        student_ids: studentId ? [Number(studentId)] : []
      });
      setStudentId("");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to assign members.");
    }
  }

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Admin LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Section Management</h2>
        <p className="mt-2 text-sm text-slate-700">
          Teachers now have access to all sections. Use this page to create sections and place students.
        </p>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <form className="panel space-y-4" onSubmit={onCreateSection}>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Create Section</p>
          <label className="block text-sm font-semibold text-slate-800">
            Code
            <input className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setCode(event.target.value)} required value={code} />
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Name
            <input className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setName(event.target.value)} required value={name} />
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Description
            <textarea className="mt-1 min-h-28 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setDescription(event.target.value)} value={description} />
          </label>
          <button className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white" type="submit">
            Create Section
          </button>
        </form>

        <div className="panel space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Assign Members</p>
          <label className="block text-sm font-semibold text-slate-800">
            Section
            <select className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setSelectedSectionId(event.target.value)} value={selectedSectionId}>
              <option value="">Choose a section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4">
            <label className="block text-sm font-semibold text-slate-800">
              Student
              <select className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setStudentId(event.target.value)} value={studentId}>
                <option value="">No student selected</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.username}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white" onClick={() => void onAssignMembers()} type="button">
            Save Assignment
          </button>
        </div>
      </div>

      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Current Sections</p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {sections.map((section) => (
            <article className="rounded-2xl border border-brandBorder bg-white p-4 shadow-soft" key={section.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{section.code}</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">{section.name}</h3>
                  <p className="mt-2 text-sm text-slate-700">{section.description || "No description yet."}</p>
                </div>
                <span className="rounded-full bg-brandBlueLight px-3 py-1 text-xs font-semibold text-brandBlue">
                  {section.status}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-brandOffWhite px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Teachers</p>
                  <p className="mt-2 text-sm text-slate-800">All active teachers have access.</p>
                </div>
                <div className="rounded-xl bg-brandOffWhite px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Students</p>
                  <p className="mt-2 text-sm text-slate-800">{section.student_count} student(s)</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
