/**
 * Remove duplicate waitlist rows (same email, ignoring case and spaces)
 * and lowercase every address. Exact duplicates stop the unique index on
 * `email` being built; mixed-case ones would be missed by signup, which
 * looks addresses up lowercased. Keeps the earliest signup. Dry run unless
 * `--yes`.
 *
 *   npm run waitlist:dedupe            # show what would change
 *   npm run waitlist:dedupe -- --yes   # do it, then run `npx prisma db push`
 */
import { PrismaClient } from "@prisma/client";

const main = async () => {
  const yes = process.argv.includes("--yes");
  const prisma = new PrismaClient();
  const rows = await prisma.waitlist.findMany({
    select: { id: true, email: true, timestamp: true },
  });
  const byEmail = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.email.trim().toLowerCase();
    byEmail.set(key, [...(byEmail.get(key) ?? []), r]);
  }
  let removed = 0;
  let renamed = 0;
  for (const [email, group] of byEmail) {
    group.sort(
      (a, b) => (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0)
    );
    const [keep, ...extra] = group;
    removed += extra.length;
    if (keep.email !== email) renamed++;
    if (!yes) continue;
    if (extra.length)
      await prisma.waitlist.deleteMany({
        where: { id: { in: extra.map((r) => r.id) } },
      });
    if (keep.email !== email)
      await prisma.waitlist.update({ where: { id: keep.id }, data: { email } });
  }
  console.log(
    `${rows.length} rows, ${byEmail.size} addresses: ${removed} duplicates to remove, ${renamed} to lowercase.${yes ? " Done." : " Dry run: pass --yes to apply."}`
  );
  await prisma.$disconnect();
};

void main();
