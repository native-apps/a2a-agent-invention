// ── Lightweight Markdown → HTML Converter ──────────────────────────────
// Supports: bold, italic, code blocks, inline code, links, headers,
// unordered/ordered lists, blockquotes, tables, horizontal rules, line breaks.
// Strips dangerous HTML to prevent XSS.
// Zero dependencies — pure regex-based parser.

export function sanitizeHtml(html: string): string {
  // Remove <script> tags and their content
  html = html.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
  // Remove on* event attributes
  html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Remove javascript: URLs
  html = html.replace(
    /href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi,
    'href="#"',
  );
  // Remove <iframe>, <object>, <embed>, <form> tags
  html = html.replace(
    /<(iframe|object|embed|form|input|button|meta|link|base)[^>]*>/gi,
    "",
  );
  return html;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMarkdown(source: string): string {
  if (!source) return "";
  let html = source;

  // Extract and protect code blocks
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="mb-code-block"><code>${escapeHtml(code.trim())}</code></pre>`,
    );
    return `\x00CODEBLOCK${idx}\x00`;
  });

  // Extract and protect inline code
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code class="mb-inline-code">${escapeHtml(code)}</code>`);
    return `\x00INLINE${idx}\x00`;
  });

  // Horizontal rules
  html = html.replace(/^(---|\*\*\*|___)\s*$/gm, "<hr>");

  // Headers (must come before bold/italic; must match most-specific first
  // so that #### isn't caught by the # or ## patterns)
  html = html.replace(/^###### (.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^##### (.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // GFM Tables
  html = html.replace(
    /^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_, headerRow, _sepRow, bodyRows) => {
      const headers = headerRow
        .split("|")
        .filter((c: string) => c.trim())
        .map((c: string) => `<th>${c.trim()}</th>`)
        .join("");
      const rows = bodyRows
        .trim()
        .split("\n")
        .map((row: string) => {
          const cells = row
            .split("|")
            .filter((c: string) => c.trim())
            .map((c: string) => `<td>${c.trim()}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<table class="mb-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    },
  );

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, "\n");

  // Unordered lists
  // eslint-disable-next-line no-control-regex -- \x00 sentinels are intentional tokenizer markers
  html = html.replace(/^[-*] (.+)$/gm, "\x00LI\x00$1\x00/LI\x00");
  // eslint-disable-next-line no-control-regex
  html = html.replace(/(\x00LI\x00[\s\S]*?\x00\/LI\x00(?:\n)?)+/g, (match) => {
    // eslint-disable-next-line no-control-regex
    const items = match.replace(/\x00LI\x00|\x00\/LI\x00/g, "").trim();
    const lis = items
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => `<li>${l.trim()}</li>`)
      .join("");
    return `<ul>${lis}</ul>`;
  });

  // Ordered lists
  // eslint-disable-next-line no-control-regex -- \x00 sentinels are intentional tokenizer markers
  html = html.replace(/^\d+\. (.+)$/gm, "\x00OLI\x00$1\x00/OLI\x00");
  // eslint-disable-next-line no-control-regex
  html = html.replace(
    /(\x00OLI\x00[\s\S]*?\x00\/OLI\x00(?:\n)?)+/g,
    (match) => {
      // eslint-disable-next-line no-control-regex
      const items = match.replace(/\x00OLI\x00|\x00\/OLI\x00/g, "").trim();
      const lis = items
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => `<li>${l.trim()}</li>`)
        .join("");
      return `<ol>${lis}</ol>`;
    },
  );

  // Bold (must come before italic)
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // Line breaks (double+ newline → paragraph break, single newline → <br>)
  html = html.replace(/\n\n+/g, "\n</p><p>\n");
  html = html.replace(/\n/g, "<br>");

  // Restore inline code
  // eslint-disable-next-line no-control-regex -- \x00 sentinels are intentional tokenizer markers
  html = html.replace(/\x00INLINE(\d+)\x00/g, (_, idx) => inlineCodes[idx]);
  // Restore code blocks
  // eslint-disable-next-line no-control-regex
  html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, idx) => codeBlocks[idx]);

  // Wrap in paragraph
  html = `<p>${html}</p>`;
  // Clean up empty paragraphs and paragraphs wrapping block elements
  html = html.replace(/<p>\s*<(h[1-6]|ul|ol|pre|blockquote|hr|table)/g, "<$1");
  html = html.replace(
    /<\/(h[1-6]|ul|ol|pre|blockquote|table)>\s*<\/p>/g,
    "</$1>",
  );
  html = html.replace(/<p>\s*<\/p>/g, "");
  // Remove empty paragraphs containing only <br> (causes excessive spacing)
  html = html.replace(/<p>\s*<br\s*\/?>\s*<\/p>/g, "");
  html = html.replace(/<p>\s*<hr\s*\/?>\s*<\/p>/g, "<hr>");
  // Collapse multiple consecutive <br> tags (max 2 in a row for intentional spacing)
  html = html.replace(/(<br\s*\/?>){4,}/g, "<br><br>");

  return sanitizeHtml(html);
}
