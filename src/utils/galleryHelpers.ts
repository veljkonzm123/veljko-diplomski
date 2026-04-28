import { FileInfo } from "../api";
import { GallerySection, GalleryTab } from "../types/gallery";
import { GRID_COLUMNS } from "../constants/gallery";

/**
 * "2024-12/15" → { monthTitle: "December 2024", dayTitle: "Monday, 15" }
 */
export const parseDatePath = (date_path: string, fallback_ts: number) => {
  try {
    if (date_path && date_path.includes("/")) {
      const [yearMonth, day] = date_path.split("/");
      const [year, month] = yearMonth.split("-");

      const date = new Date(Number(year), Number(month) - 1, Number(day));

      const monthTitle = date.toLocaleString("default", {
        month: "long",
        year: "numeric",
      });

      const dayTitle = date.toLocaleString("default", {
        weekday: "long",
        day: "numeric",
      });

      return {
        monthTitle,
        dayTitle,
        sortKey: `${yearMonth}/${day.padStart(2, "0")}`,
      };
    }
  } catch {}

  // Fallback: use the file's mtime
  const date = new Date(fallback_ts * 1000);
  return {
    monthTitle: date.toLocaleString("default", {
      month: "long",
      year: "numeric",
    }),
    dayTitle: date.toLocaleString("default", {
      weekday: "long",
      day: "numeric",
    }),
    sortKey: date.toISOString().slice(0, 10),
  };
};

/**
 * Group files into sections by day, chunked into rows for grid display
 */
export const groupByDay = (
  files: FileInfo[],
  mode: GalleryTab,
): GallerySection[] => {
  const map = new Map<
    string,
    {
      monthTitle: string;
      dayTitle: string;
      date_path: string;
      files: FileInfo[];
    }
  >();

  for (const file of files) {
    const { monthTitle, dayTitle, sortKey } = parseDatePath(
      file.date_path || "",
      file.created,
    );

    if (!map.has(sortKey)) {
      map.set(sortKey, {
        monthTitle,
        dayTitle,
        date_path: file.date_path || "",
        files: [],
      });
    }
    map.get(sortKey)!.files.push(file);
  }

  // Sort sections newest-first
  const sorted = Array.from(map.entries()).sort((a, b) =>
    b[0].localeCompare(a[0]),
  );

  return sorted.map(([, value]) => {
    const rows: FileInfo[][] = [];
    if (mode === "photos") {
      // Chunk into grid rows
      for (let i = 0; i < value.files.length; i += GRID_COLUMNS) {
        rows.push(value.files.slice(i, i + GRID_COLUMNS));
      }
    } else {
      // One video per row
      value.files.forEach((f) => rows.push([f]));
    }

    return {
      title: value.monthTitle,
      subtitle: value.dayTitle,
      data: rows,
      date_path: value.date_path,
    };
  });
};
