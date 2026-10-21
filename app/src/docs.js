// The docs are the repository's own markdown, imported at build time, so the
// site cannot drift from the project. The HTML rendered from it is inserted
// directly; that is safe only because the source is bundled from this
// repository, never fetched or user-supplied.
import { Marked } from "marked";
import gettingStarted from "../../docs/GETTING-STARTED.md?raw";
import architecture from "../../docs/ARCHITECTURE.md?raw";
import claimFormat from "../../docs/CLAIM-FORMAT.md?raw";
import integration from "../../docs/INTEGRATION.md?raw";
import deployment from "../../docs/DEPLOYMENT.md?raw";
import faq from "../../docs/FAQ.md?raw";
import threatModel from "../../docs/THREAT-MODEL.md?raw";
import plan from "../../PLAN.md?raw";

export const REPO_URL = "https://github.com/Ritapossible/CounterSign";

export const DOCS = [
  { slug: "getting-started", title: "Getting started", file: "docs/GETTING-STARTED.md", group: "Guides", source: gettingStarted },
  { slug: "how-it-works", title: "How it works", file: "docs/ARCHITECTURE.md", group: "Guides", source: architecture },
  { slug: "integration", title: "Integration", file: "docs/INTEGRATION.md", group: "Guides", source: integration },
  { slug: "deployment", title: "Deployment", file: "docs/DEPLOYMENT.md", group: "Guides", source: deployment },
  { slug: "faq", title: "FAQ", file: "docs/FAQ.md", group: "Guides", source: faq },
  { slug: "claim-format", title: "Claim format", file: "docs/CLAIM-FORMAT.md", group: "Reference", source: claimFormat },
  { slug: "threat-model", title: "Threat model", file: "docs/THREAT-MODEL.md", group: "Reference", source: threatModel },
  { slug: "plan", title: "Plan and test records", file: "PLAN.md", group: "Reference", source: plan },
];
export const GROUPS = ["Guides", "Reference"];

const BY_NAME = new Map(DOCS.map((d) => [d.file.split("/").pop(), d.slug]));

const slugify = (text) =>
  text.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");

/** Map a link written for GitHub onto the site. ``from`` is the doc's path. */
function rewrite(href, from) {
  if (/^(https?:|mailto:)/.test(href)) return { url: href, external: true };
  if (href.startsWith("#")) return { url: href, external: false };
  const [base] = href.split("#");
  const name = base.split("/").pop() ?? "";
  const slug = BY_NAME.get(name);
  if (slug) return { url: `#/docs/${slug}`, external: false };
  // Anything else is a file in the repository, relative to the doc.
  const parts = [...from.split("/").slice(0, -1), ...base.split("/")].reduce((acc, p) => {
    if (p === "..") acc.pop();
    else if (p && p !== ".") acc.push(p);
    return acc;
  }, []);
  return { url: `${REPO_URL}/blob/main/${parts.join("/")}`, external: true };
}

/** Markdown to HTML, with ids on headings and a table of contents of ## headings. */
export function renderDoc(doc) {
  const toc = [];
  const md = new Marked({ gfm: true });
  md.use({
    renderer: {
      heading(token) {
        const inner = this.parser.parseInline(token.tokens);
        if (token.depth === 1) return `<h1>${inner}</h1>`;
        const id = slugify(inner);
        if (token.depth === 2) toc.push({ id, text: inner.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'") });
        return `<h${token.depth} id="${id}">${inner}</h${token.depth}>`;
      },
      link(token) {
        const { url, external } = rewrite(token.href, doc.file);
        const inner = this.parser.parseInline(token.tokens);
        return external ? `<a href="${url}" target="_blank" rel="noreferrer">${inner}</a>` : `<a href="${url}">${inner}</a>`;
      },
      table(token) {
        // Wide tables scroll inside their own box, never the page.
        const head = token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join("");
        const rows = token.rows.map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join("")}</tr>`).join("");
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      },
    },
  });
  return { html: md.parse(doc.source), toc };
}
