import * as argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const demoUsers = [
  {
    email: "owner@itecify.demo",
    name: "Demo Owner",
    role: "OWNER",
    password: "DemoPass123!",
  },
  {
    email: "editor1@itecify.demo",
    name: "Demo Editor One",
    role: "EDITOR",
    password: "DemoPass123!",
  },
  {
    email: "editor2@itecify.demo",
    name: "Demo Editor Two",
    role: "EDITOR",
    password: "DemoPass123!",
  },
];

const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

try {
  const seededUserIds = [];

  for (const user of demoUsers) {
    const passwordHash = await argon2.hash(
      user.password,
      PASSWORD_HASH_OPTIONS,
    );
    const record = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash,
        role: user.role,
      },
      create: {
        email: user.email,
        name: user.name,
        passwordHash,
        role: user.role,
      },
    });

    seededUserIds.push(record.id);
  }

  await prisma.session.deleteMany({
    where: {
      userId: { in: seededUserIds },
    },
  });

  console.log("Seeded demo accounts:");
  for (const user of demoUsers) {
    console.log(
      `- ${user.role.toLowerCase()}: ${user.email} / ${user.password}`,
    );
  }
} finally {
  await prisma.$disconnect();
}
