import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import markdownit from "markdown-it";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourceRoot = path.join(projectRoot, "src");
const inboxRoot = path.join(projectRoot, "inbox");
const templatePath = path.join(sourceRoot, "templates", "post.html");

function parseArguments(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      if (!result.source) result.source = value;
      else throw new Error(`Unexpected argument: ${value}`);
      continue;
    }

    const equalIndex = value.indexOf("=");
    const key = value.slice(2, equalIndex === -1 ? undefined : equalIndex);
    if (["help", "dry-run"].includes(key)) {
      result[key] = true;
      continue;
    }

    const argumentValue = equalIndex === -1 ? values[index + 1] : value.slice(equalIndex + 1);
    if (!argumentValue || (equalIndex === -1 && argumentValue.startsWith("--"))) {
      throw new Error(`Missing value for --${key}.`);
    }
    result[key] = argumentValue;
    if (equalIndex === -1) index += 1;
  }
  return result;
}

function printHelp() {
  console.log(`Create a post from Markdown.

Usage:
  npm run new-post
  npm run new-post -- --source inbox/article.md --category film-reviews --slug my-post

Options:
  --source <file>       Markdown file (default: inbox/article.md)
  --category <path>    Folder path relative to src
  --slug <slug>        English URL segment, e.g. my-post
  --title <title>      Display title (default: first Markdown H1)
  --date <datetime>    YYYY-MM-DD, YYYY-MM-DD HH:mm, or ISO datetime
  --dry-run            Validate and render without writing
  --help               Show this help`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainText(value) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .trim();
}

function titleFromMarkdown(markdown) {
  return plainText(markdown.match(/^#\s+(.+)\s*$/m)?.[1] ?? "");
}

function removeFirstTitle(markdown) {
  let removed = false;
  return markdown.replace(/^#\s+.*(?:\r?\n|$)/m, (match) => {
    if (removed) return match;
    removed = true;
    return "";
  }).trim();
}

function youtubeId(urlValue) {
  try {
    const url = new URL(urlValue);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (!["youtube.com", "m.youtube.com"].includes(host)) return null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    if (["embed", "shorts"].includes(parts[0])) return parts[1] ?? null;
    return null;
  } catch {
    return null;
  }
}

function youtubeFrame(id) {
  if (!/^[a-zA-Z0-9_-]{6,}$/.test(id)) return "";
  return [
    '<div class="video-frame">',
    "  <iframe",
    `    src="https://www.youtube-nocookie.com/embed/${escapeHtml(id)}"`,
    '    title="YouTube 视频"',
    '    loading="lazy"',
    '    referrerpolicy="strict-origin-when-cross-origin"',
    '    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"',
    "    allowfullscreen>",
    "  </iframe>",
    "</div>\n"
  ].join("\n");
}

function createMarkdownRenderer() {
  const markdown = markdownit({
    html: false,
    linkify: true,
    typographer: false
  });

  for (const ruleName of ["fence", "code_block"]) {
    const original = markdown.renderer.rules[ruleName];
    if (!original) continue;
    markdown.renderer.rules[ruleName] = (...argumentsList) =>
      original(...argumentsList).replace(/^<pre>/, '<pre class="code-block">');
  }

  markdown.core.ruler.after("inline", "standalone_youtube", (state) => {
    for (let index = 0; index <= state.tokens.length - 3; index += 1) {
      const open = state.tokens[index];
      const inline = state.tokens[index + 1];
      const close = state.tokens[index + 2];
      if (open.type !== "paragraph_open" || inline.type !== "inline" || close.type !== "paragraph_close") continue;

      const children = inline.children ?? [];
      if (children.length !== 3 || children[0].type !== "link_open" || children[2].type !== "link_close") continue;
      const href = children[0].attrGet("href") ?? "";
      const id = youtubeId(href);
      if (!id) continue;

      const token = new state.Token("html_block", "", 0);
      token.content = youtubeFrame(id);
      token.map = open.map;
      state.tokens.splice(index, 3, token);
    }
  });

  return markdown;
}

function folderTitle(html) {
  const match = html.match(/<h1\b[^>]*data-page-title[^>]*>([\s\S]*?)<\/h1>/i);
  return match?.[1].replace(/<[^>]*>/g, "").trim() ?? "";
}

function discoverFolders() {
  const folders = [];

  function visit(directory) {
    const indexPath = path.join(directory, "index.html");
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, "utf8");
      if (/<body\b[^>]*data-page-type=["']folder["']/i.test(html)) {
        folders.push({
          relativePath: path.relative(sourceRoot, directory).split(path.sep).join("/"),
          title: folderTitle(html)
        });
      }
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (["assets", "templates"].includes(entry.name) || entry.name.startsWith(".")) continue;
      visit(path.join(directory, entry.name));
    }
  }

  visit(sourceRoot);
  return folders.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en", { numeric: true }));
}

function normalizeCategory(value, folders) {
  let relativePath = value.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/^src\//, "");
  relativePath = relativePath.replace(/^\/+|\/+$/g, "");
  if (!relativePath || relativePath.split("/").includes("..")) {
    throw new Error("Category must be a folder path relative to src.");
  }
  const folder = folders.find((candidate) => candidate.relativePath === relativePath);
  if (!folder) throw new Error(`Folder category does not exist: ${relativePath}`);
  return folder;
}

function normalizeSlug(value) {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Slug must contain lowercase English letters, numbers, and single hyphens only.");
  }
  return slug;
}

function localTimestamp() {
  const date = new Date();
  const part = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
}

function normalizeDate(value) {
  const trimmed = value.trim().replace(" ", "T");
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) throw new Error("Date must use YYYY-MM-DD, YYYY-MM-DD HH:mm, or ISO datetime.");
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (
    date.getFullYear() !== Number(year) || date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) || date.getMinutes() !== Number(minute) || date.getSeconds() !== Number(second)
  ) {
    throw new Error("Date contains an invalid calendar value.");
  }
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function displayDate(value) {
  return `${value.slice(0, 10).replaceAll("-", ".")} ${value.slice(11, 16)}`;
}

function indent(value, spaces) {
  const prefix = " ".repeat(spaces);
  return value.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

function renderPost(template, { title, date, bodyHtml }) {
  const safeTitle = escapeHtml(title);
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${safeTitle} — lilykekerun</title>`)
    .replace(/(<h1\b[^>]*data-page-title[^>]*>)[\s\S]*?(<\/h1>)/, `$1${safeTitle}$2`)
    .replace(/<time\b[^>]*datetime="[^"]*"[^>]*>[\s\S]*?<\/time>/, `<time datetime="${date}">${displayDate(date)}</time>`)
    .replace(/(<article class="article-body">)[\s\S]*?(<\/article>)/, `$1\n${indent(bodyHtml.trim(), 8)}\n      $2`);
}

function defaultSourcePath() {
  const conventional = path.join(inboxRoot, "article.md");
  if (fs.existsSync(conventional)) return conventional;
  if (!fs.existsSync(inboxRoot)) return conventional;
  const candidates = fs.readdirSync(inboxRoot)
    .filter((name) => name.endsWith(".md") && name.toLowerCase() !== "readme.md" && !name.startsWith("_"));
  return candidates.length === 1 ? path.join(inboxRoot, candidates[0]) : conventional;
}

function relativeDisplay(filePath) {
  const relative = path.relative(projectRoot, filePath);
  return relative.startsWith("..") ? filePath : relative;
}

async function askWithDefault(readline, question, defaultValue = "") {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await readline.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function main() {
  const argumentsMap = parseArguments(process.argv.slice(2));
  if (argumentsMap.help) {
    printHelp();
    return;
  }
  if (!fs.existsSync(sourceRoot) || !fs.existsSync(templatePath)) {
    throw new Error("Website src or post template is missing.");
  }

  const readline = createInterface({ input, output });
  try {
    const suggestedSource = defaultSourcePath();
    const sourceInput = argumentsMap.source ?? await askWithDefault(readline, "Markdown 文件", relativeDisplay(suggestedSource));
    const sourcePath = path.resolve(projectRoot, sourceInput);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      throw new Error(`Markdown file does not exist: ${sourceInput}`);
    }
    if (path.extname(sourcePath).toLowerCase() !== ".md") {
      throw new Error("Source file must use the .md extension.");
    }

    const markdownSource = fs.readFileSync(sourcePath, "utf8");
    const inferredTitle = titleFromMarkdown(markdownSource);
    const title = (argumentsMap.title ?? await askWithDefault(readline, "文章标题", inferredTitle)).trim();
    if (!title) throw new Error("Article title cannot be empty.");

    const folders = discoverFolders();
    if (!argumentsMap.category) {
      console.log("\n可用分类：");
      for (const folder of folders) console.log(`  ${folder.relativePath} — ${folder.title}`);
      console.log("");
    }
    const categoryInput = argumentsMap.category ?? await askWithDefault(readline, "分类相对路径");
    const category = normalizeCategory(categoryInput, folders);

    const fileStem = path.basename(sourcePath, path.extname(sourcePath)).toLowerCase();
    const suggestedSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fileStem) ? fileStem : "";
    const slugInput = argumentsMap.slug ?? await askWithDefault(readline, "英文 slug", suggestedSlug);
    const slug = normalizeSlug(slugInput);

    const dateInput = argumentsMap.date ?? await askWithDefault(readline, "发布时间", localTimestamp());
    const date = normalizeDate(dateInput);
    const targetDirectory = path.resolve(sourceRoot, ...category.relativePath.split("/"), slug);
    if (!targetDirectory.startsWith(`${sourceRoot}${path.sep}`)) throw new Error("Target path escapes src.");
    if (fs.existsSync(targetDirectory)) throw new Error(`Target already exists: ${path.relative(sourceRoot, targetDirectory)}`);

    const markdownBody = removeFirstTitle(markdownSource);
    if (!markdownBody) throw new Error("Article body is empty after removing the title.");
    const markdown = createMarkdownRenderer();
    const bodyHtml = markdown.render(markdownBody);
    const template = fs.readFileSync(templatePath, "utf8");
    const finalHtml = renderPost(template, { title, date, bodyHtml });
    const targetPath = path.join(targetDirectory, "index.html");

    console.log(`\n来源：${relativeDisplay(sourcePath)}`);
    console.log(`分类：${category.relativePath} — ${category.title}`);
    console.log(`目标：${path.relative(projectRoot, targetPath)}`);
    console.log(`时间：${date}`);

    if (argumentsMap["dry-run"]) {
      console.log("Dry run complete; no files were written.");
      return;
    }

    fs.mkdirSync(targetDirectory, { recursive: false });
    fs.writeFileSync(targetPath, finalHtml, "utf8");
    console.log("Article page created. Source Markdown was kept unchanged.");

    const build = spawnSync(process.execPath, [path.join(scriptDirectory, "build.mjs")], {
      cwd: projectRoot,
      stdio: "inherit"
    });
    if (build.status !== 0) {
      throw new Error(`Article was created, but build failed with exit code ${build.status}.`);
    }
    console.log("Navigation and sorting updated.");
  } finally {
    readline.close();
  }
}

main().catch((error) => {
  console.error(`new-post failed: ${error.message}`);
  process.exitCode = 1;
});
