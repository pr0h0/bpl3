export interface DocSection {
  title: string;
  content: string;
}

export interface ParsedDoc {
  description: string;
  sections: DocSection[];
}

export class DocParser {
  public static parse(doc: string): ParsedDoc {
    const lines = doc.split(/\r?\n/);
    const descriptionLines: string[] = [];
    const sections: DocSection[] = [];

    let currentSection: DocSection | null = null;

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headerMatch) {
        // New section starting
        if (currentSection) {
          currentSection.content = currentSection.content.trim();
          sections.push(currentSection);
        }

        currentSection = {
          title: headerMatch[2]?.trim() || "",
          content: "",
        };
      } else if (currentSection) {
        currentSection.content += line + "\n";
      } else {
        descriptionLines.push(line);
      }
    }

    // Push last section
    if (currentSection) {
      currentSection.content = currentSection.content.trim();
      sections.push(currentSection);
    }

    return {
      description: descriptionLines.join("\n").trim(),
      sections,
    };
  }

  public static getArgumentDoc(
    parsed: ParsedDoc,
    argName: string,
  ): string | undefined {
    // Look for "Arguments" or "Parameters" section
    const argSection = parsed.sections.find(
      (s) =>
        s.title.toLowerCase() === "arguments" ||
        s.title.toLowerCase() === "parameters",
    );

    if (!argSection) return undefined;

    // Parse list items: - `name`: description or - name: description
    const lines = argSection.content.split("\n");
    for (const line of lines) {
      // Regex to match: - `argName`: ... or - argName: ...
      // Also handle * instead of -
      const regex = new RegExp(
        `^[-*]\\s+(?:\`?${argName}\`?)\\s*:\\s*(.+)$`,
        "i",
      );
      const match = line.match(regex);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }
}
