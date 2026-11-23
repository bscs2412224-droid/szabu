import { prisma } from "../src/db.js";
import bcrypt from "bcryptjs";
import type { Role, UserStatus } from "@prisma/client";
import { DIRECTORY_DATA } from "../../frontend/src/data/directory.js";

/**
 * Seeds the ERD tables with the SZABIST test data.
 *
 * Hierarchy (departments -> programs -> batches):
 * Names and designations follow the official SZABIST faculty list.
 *   FCESC (department)            Dean: Dr. Faraz Junejo
 *     Computer Science (program)  HOD:  Dr. Mohammad Shahzad Haroon
 *       4th Year (batch)          PM:   Ms. Faria Jameel
 *       3rd Year (batch)          PM:   Mr. Mubeen Ahmed Khan
 *       2nd Year (batch)          PM:   Mr. Muhammad Ahsan
 *       1st Year (batch)          PM:   Ms. Ayesha Ghayas
 *
 * People added by the administrator (UC-04) who have NOT signed up yet are users rows with
 * status PENDING and no password_hash. They complete UC-01 Sign Up with their SZABIST email.
 */

type BatchKey = "Y4" | "Y3" | "Y2" | "Y1";

interface SeedUser {
  szabist_id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  inProgram?: boolean; // belongs to the Computer Science program
  batch?: BatchKey; // students belong to a batch
  password?: "default" | "admin"; // omitted = no account yet
}

const seedUsers: SeedUser[] = [
  // ---- Management (hierarchy) ----
  { szabist_id: "FAC-1002", email: "faraz.junejo@szabist.edu.pk", name: "Dr. Faraz Junejo", role: "DEAN", status: "ACTIVE", password: "default" },
  { szabist_id: "FAC-1005", email: "mohammad.shahzad.haroon@szabist.edu.pk", name: "Dr. Mohammad Shahzad Haroon", role: "HOD", status: "PENDING", inProgram: true },
  { szabist_id: "FAC-1006", email: "faria.jameel@szabist.edu.pk", name: "Ms. Faria Jameel", role: "PM", status: "PENDING", inProgram: true },
  { szabist_id: "FAC-1003", email: "mubeen.ahmed.khan@szabist.edu.pk", name: "Mr. Mubeen Ahmed Khan", role: "PM", status: "ACTIVE", inProgram: true, password: "default" },
  { szabist_id: "FAC-1007", email: "muhammad.ahsan@szabist.edu.pk", name: "Mr. Muhammad Ahsan", role: "PM", status: "PENDING", inProgram: true },
  { szabist_id: "FAC-1008", email: "ayesha.ghayas@szabist.edu.pk", name: "Ms. Ayesha Ghayas", role: "PM", status: "PENDING", inProgram: true },

  // ---- Faculty ----
  { szabist_id: "FAC-1001", email: "asim.riaz@szabist.edu.pk", name: "Mr. Asim Riaz", role: "FACULTY", status: "PENDING", inProgram: true },
  // Suspended account: login refused
  { szabist_id: "FAC-1004", email: "tariq.m@szabist.edu.pk", name: "Tariq Mehmood", role: "FACULTY", status: "SUSPENDED", inProgram: true, password: "default" },

  // ---- Administrator ----
  { szabist_id: "ADM-0001", email: "admin@szabist.edu.pk", name: "System Administrator", role: "ADMIN", status: "ACTIVE", password: "admin" },

  // ---- Students ----
  // Added by the admin, no account yet (use these to test Sign Up)
  { szabist_id: "2112298", email: "bcsbs2112298@szabist.pk", name: "Zainab", role: "STUDENT", status: "PENDING", inProgram: true, batch: "Y4" },
  { szabist_id: "2380132", email: "bsse2380132@szabist.pk", name: "Ayesha Siddiqui", role: "STUDENT", status: "PENDING", inProgram: true, batch: "Y1" },
  // Registered
  { szabist_id: "2212135", email: "bcsbs2212135@szabist.pk", name: "Zain", role: "STUDENT", status: "ACTIVE", inProgram: true, batch: "Y4", password: "default" },
  // Not placed in the hierarchy yet: can log in, messaging blocked
  // No account yet, so the real email code (SMTP) sign-up can be tested with these two
  { szabist_id: "2312246", email: "bscs2312246@szabist.pk", name: "Farzeen", role: "STUDENT", status: "AWAITING_ASSIGNMENT" },
  { szabist_id: "2412224", email: "bscs2412224@szabist.pk", name: "Student 2412224", role: "STUDENT", status: "AWAITING_ASSIGNMENT" },
];

// Which batch (year) each Program Manager looks after
const batchDefs: { key: BatchKey; name: string; pmSzabistId: string }[] = [
  { key: "Y4", name: "BSCS 4th Year", pmSzabistId: "FAC-1006" }, // Ms. Faria Jameel
  { key: "Y3", name: "BSCS 3rd Year", pmSzabistId: "FAC-1003" }, // Mr. Mubeen Ahmed Khan
  { key: "Y2", name: "BSCS 2nd Year", pmSzabistId: "FAC-1007" }, // Mr. Muhammad Ahsan
  { key: "Y1", name: "BSCS 1st Year", pmSzabistId: "FAC-1008" }, // Ms. Ayesha Ghayas
];

async function main() {
  console.log("Seeding SZABIST organisation and accounts...");

  const defaultPasswordHash = await bcrypt.hash("Password123!", 10);
  const adminPasswordHash = await bcrypt.hash("Password123!", 10);

  // 1. department -> program -> batches
  let department = await prisma.department.findFirst({ where: { name: "FCESC" } });
  if (!department) department = await prisma.department.create({ data: { name: "FCESC" } });

  let program = await prisma.program.findFirst({
    where: { name: "Computer Science", department_id: department.department_id },
  });
  if (!program) {
    program = await prisma.program.create({
      data: { name: "Computer Science", department_id: department.department_id },
    });
  }

  const batchIds = {} as Record<BatchKey, string>;
  for (const def of batchDefs) {
    let batch = await prisma.batch.findFirst({ where: { name: def.name, program_id: program.program_id } });
    if (!batch) batch = await prisma.batch.create({ data: { name: def.name, program_id: program.program_id } });
    batchIds[def.key] = batch.batch_id;
  }

  // 2. Users (upsert by szabist_id; never overwrite an existing password or status)
  for (const u of seedUsers) {
    const common = {
      email: u.email,
      name: u.name,
      role: u.role,
      program_id: u.inProgram ? program.program_id : null,
      batch_id: u.batch ? batchIds[u.batch] : null,
    };
    await prisma.user.upsert({
      where: { szabist_id: u.szabist_id },
      update: common,
      create: {
        szabist_id: u.szabist_id,
        ...common,
        status: u.status,
        password_hash:
          u.password === "admin" ? adminPasswordHash : u.password === "default" ? defaultPasswordHash : null,
      },
    });
  }

  // 2b. Everyone in the campus directory (frontend/src/data/directory.ts) gets an account row, so everyone in the
  //     directory can be messaged. They have not signed up yet (PENDING) and use their directory email, a dummy
  //     firstname.lastname@szabist.edu.pk. People already in the database (matched by name) keep their account.
  const taken = new Set((await prisma.user.findMany({ select: { szabist_id: true } })).map((u) => u.szabist_id));
  let nextNumber = 2001;
  for (const d of DIRECTORY_DATA.filter((x) => x.category !== "Student" && x.email)) {
    const existing = await prisma.user.findFirst({ where: { name: d.name } });
    if (existing) {
      // a not-yet-registered placeholder row (FAC-2xxx) is brought up to date with the directory email
      if (/^FAC-2\d+$/.test(existing.szabist_id) && !existing.password_hash && existing.email !== d.email) {
        await prisma.user.update({ where: { user_id: existing.user_id }, data: { email: d.email as string } });
      }
      continue;
    }
    while (taken.has(`FAC-${nextNumber}`)) nextNumber++;
    const szabistId = `FAC-${nextNumber}`;
    taken.add(szabistId);
    const role: Role = /Head of/.test(d.role) ? "HOD" : /Program Manager/.test(d.role) ? "PM" : "FACULTY";
    await prisma.user.create({
      data: { szabist_id: szabistId, email: d.email as string, name: d.name, role, status: "PENDING", program_id: program.program_id },
    });
  }

  // 3. Who heads what: Dean -> department, HOD -> program, each PM -> their year's batch
  const dean = await prisma.user.findUniqueOrThrow({ where: { szabist_id: "FAC-1002" } });
  await prisma.department.update({
    where: { department_id: department.department_id },
    data: { dean_id: dean.user_id },
  });

  const hod = await prisma.user.findUniqueOrThrow({ where: { szabist_id: "FAC-1005" } });
  await prisma.program.update({ where: { program_id: program.program_id }, data: { hod_id: hod.user_id } });

  for (const def of batchDefs) {
    const pm = await prisma.user.findUniqueOrThrow({ where: { szabist_id: def.pmSzabistId } });
    await prisma.batch.update({ where: { batch_id: batchIds[def.key] }, data: { pm_id: pm.user_id } });
  }

  // 4. Demo classes (4th year): who teaches which students. Messaging uses this to decide
  //    which faculty a student may message (SRS Table 1: "faculty of their sections").
  const TERM = "Fall 2026";
  const demoClasses = [
    { code: "CSC-411", title: "Final Year Project I (FYP-I)", teacher: "FAC-1001", students: ["2212138", "2112298"] },
    { code: "CSC-382", title: "Software Quality Assurance", teacher: "FAC-1003", students: ["2212138", "2112298"] },
  ];

  for (const c of demoClasses) {
    const course = await prisma.course.upsert({
      where: { code: c.code },
      update: { title: c.title },
      create: { code: c.code, title: c.title, batch_id: batchIds.Y4 },
    });
    const teacher = await prisma.user.findUniqueOrThrow({ where: { szabist_id: c.teacher } });

    let section = await prisma.section.findFirst({
      where: { course_id: course.course_id, faculty_id: teacher.user_id, section_name: "A", term: TERM },
    });
    if (!section) {
      section = await prisma.section.create({
        data: { course_id: course.course_id, faculty_id: teacher.user_id, section_name: "A", term: TERM },
      });
    }

    for (const sid of c.students) {
      const student = await prisma.user.findUniqueOrThrow({ where: { szabist_id: sid } });
      await prisma.enrollment.upsert({
        where: { section_id_student_id: { section_id: section.section_id, student_id: student.user_id } },
        update: {},
        create: { section_id: section.section_id, student_id: student.user_id },
      });
    }
  }

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
