import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();

const dbUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:1234@localhost:5432/szabu?schema=public";
const adapter = new PrismaPg({ connectionString: dbUrl });

export const prisma = new PrismaClient({ adapter });
export default prisma;
