import type { BookNoteDayDto } from "@/lib/book-notes/types";
import {
  postingDateToUtcMidnight,
  serializeBookNoteDay,
} from "@/lib/book-notes/serialize";
import { prisma } from "@/lib/prisma";

export async function loadBookNoteDayDto(input: {
  companyId: string;
  companyLocationId: string;
  postingDateYmd: string;
  now?: Date;
}): Promise<BookNoteDayDto | null> {
  const postingDate = postingDateToUtcMidnight(input.postingDateYmd);
  const day = await prisma.bookNoteDay.findUnique({
    where: {
      companyLocationId_postingDate: {
        companyLocationId: input.companyLocationId,
        postingDate,
      },
    },
    include: {
      companyLocation: {
        select: { name: true, erpnextCompany: true, companyId: true },
      },
      rows: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!day || day.companyId !== input.companyId) return null;

  return serializeBookNoteDay({
    id: day.id,
    companyLocationId: day.companyLocationId,
    postingDate: day.postingDate,
    location: day.companyLocation,
    rows: day.rows,
    now: input.now,
  });
}

export async function loadBookNoteDaysInRange(input: {
  companyId: string;
  companyLocationId: string;
  fromYmd: string;
  toYmd: string;
  now?: Date;
}): Promise<BookNoteDayDto[]> {
  const from = postingDateToUtcMidnight(input.fromYmd);
  const to = postingDateToUtcMidnight(input.toYmd);
  const days = await prisma.bookNoteDay.findMany({
    where: {
      companyId: input.companyId,
      companyLocationId: input.companyLocationId,
      postingDate: { gte: from, lte: to },
    },
    include: {
      companyLocation: {
        select: { name: true, erpnextCompany: true },
      },
      rows: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { postingDate: "asc" },
  });

  return days.map((day) =>
    serializeBookNoteDay({
      id: day.id,
      companyLocationId: day.companyLocationId,
      postingDate: day.postingDate,
      location: day.companyLocation,
      rows: day.rows,
      now: input.now,
    }),
  );
}
