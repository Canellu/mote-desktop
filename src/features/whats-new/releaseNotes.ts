import changelog from "../../../CHANGELOG.md?raw";

export interface ReleaseNotesSection {
  title: string;
  items: string[];
}

export interface ReleaseNotes {
  version: string;
  date: string | null;
  sections: ReleaseNotesSection[];
}

/**
 * Reads one version's entry out of CHANGELOG.md, which is bundled at build
 * time, so the notes a customer sees are the ones that shipped with the build.
 *
 * Only the shape the changelog uses is understood: a `## [x.y.z] - date`
 * heading, `###` sections, and `- ` bullets whose continuation lines are
 * indented. Anything else in the entry is skipped.
 */
export const parseReleaseNotes = (
  markdown: string,
  version: string,
): ReleaseNotes | null => {
  const lines = markdown.split(/\r?\n/);
  const heading = new RegExp(
    `^## \\[${version.replace(/\./g, "\\.")}\\](?:\\s*-\\s*(.+))?\\s*$`,
  );
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return null;

  const date = lines[start].match(heading)?.[1]?.trim() ?? null;
  const sections: ReleaseNotesSection[] = [];
  let section: ReleaseNotesSection | null = null;
  let item: string | null = null;

  const closeItem = () => {
    if (section && item) section.items.push(item);
    item = null;
  };

  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    if (line.startsWith("### ")) {
      closeItem();
      section = { title: line.slice(4).trim(), items: [] };
      sections.push(section);
    } else if (line.startsWith("- ")) {
      closeItem();
      item = line.slice(2).trim();
    } else if (item !== null && /^\s+\S/.test(line)) {
      item = `${item} ${line.trim()}`;
    } else if (!line.trim()) {
      closeItem();
    }
  }
  closeItem();

  const filled = sections.filter((candidate) => candidate.items.length > 0);
  return filled.length > 0 ? { version, date, sections: filled } : null;
};

export const releaseNotesFor = (version: string): ReleaseNotes | null =>
  parseReleaseNotes(changelog, version);
