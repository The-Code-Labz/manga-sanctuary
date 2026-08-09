// Minimal, dependency-free markdown renderer — this app avoids pulling in
// react-markdown/remark for content it fully authors itself (same call made
// for the chapter reader's inline images earlier). Covers exactly what
// api-docs-content.ts actually uses: headers, hr, fenced code blocks,
// tables, bullet lists, bold, inline code, links, and paragraphs.

import type { ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Matches, in priority order: **bold**, `code`, [label](url)
  const re = /\*\*(.+?)\*\*|`([^`]+?)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b-${i++}`} className="font-bold text-foreground">{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(
        <code key={`${keyPrefix}-c-${i++}`} className="px-1.5 py-0.5 rounded bg-secondary text-primary text-[0.85em] font-mono">
          {match[2]}
        </code>,
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <a key={`${keyPrefix}-a-${i++}`} href={match[4]} className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer">
          {match[3]}
        </a>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export default function MarkdownLite({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      i++; // skip closing fence
      blocks.push(
        <pre key={key++} className="my-3 p-3 rounded-lg bg-secondary/60 border border-border/30 overflow-x-auto text-xs font-mono leading-relaxed">
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      if (lang) { /* language kept only for potential future syntax highlighting */ }
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim())) {
      blocks.push(<hr key={key++} className="my-5 border-border/30" />);
      i++;
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const cls = level === 1
        ? "text-2xl font-extrabold mt-6 mb-3 first:mt-0"
        : level === 2
        ? "text-lg font-bold mt-6 mb-2 pb-1 border-b border-border/30"
        : "text-sm font-bold mt-4 mb-1.5 text-primary";
      const Tag = (level === 1 ? "h1" : level === 2 ? "h2" : level === 3 ? "h3" : "h4") as keyof JSX.IntrinsicElements;
      blocks.push(<Tag key={key++} className={cls}>{renderInline(text, `h${key}`)}</Tag>);
      i++;
      continue;
    }

    // Table (header row + separator row)
    if (line.trim().startsWith("|") && lines[i + 1]?.match(/^\s*\|[\s\-:|]+\|\s*$/)) {
      const splitRow = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const headerCells = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(splitRow(lines[i])); i++; }
      blocks.push(
        <div key={key++} className="my-3 overflow-x-auto rounded-lg border border-border/30">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-secondary/40">
                {headerCells.map((c, ci) => (
                  <th key={ci} className="px-3 py-2 text-left font-bold border-b border-border/30">{renderInline(c, `th${ci}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-border/10 last:border-0">
                  {r.map((c, ci) => <td key={ci} className="px-3 py-2 align-top">{renderInline(c, `td${ri}-${ci}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Bullet list
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*-\s+/, "")); i++; }
      blocks.push(
        <ul key={key++} className="my-2 ml-1 space-y-1 list-disc list-inside text-sm text-muted-foreground">
          {items.map((it, ii) => <li key={ii}>{renderInline(it, `li${ii}`)}</li>)}
        </ul>,
      );
      continue;
    }

    // Paragraph — collect consecutive plain lines
    const paraLines: string[] = [];
    while (
      i < lines.length && lines[i].trim() !== "" &&
      !lines[i].startsWith("```") && !/^#{1,4}\s/.test(lines[i]) &&
      !/^\s*-\s+/.test(lines[i]) && !/^-{3,}$/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("|")
    ) { paraLines.push(lines[i]); i++; }
    blocks.push(
      <p key={key++} className="my-2 text-sm text-muted-foreground leading-relaxed">
        {renderInline(paraLines.join(" "), `p${key}`)}
      </p>,
    );
  }

  return <div className="max-w-none">{blocks}</div>;
}
