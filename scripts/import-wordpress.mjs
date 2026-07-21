import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(scriptDirectory, "..");
const sourceRoot = path.join(siteRoot, "src");
const xmlPath = path.resolve(siteRoot, process.argv[2] ?? "");

const categorySlugs = new Map([
  ["Uncategorized", "uncategorized"],
  ["影评", "film-reviews"],
  ["感受", "reflections"],
  ["杂记", "notes"],
  ["书评", "book-reviews"]
]);

const postSlugs = new Map([
  ["0606 颐和园", "0606-yi-he-yuan"],
  ["0717", "0717"],
  ["0610 海街日记", "0610-hai-jie-ri-ji"],
  ["0611 推手", "0611-tui-shou"],
  ["0615 2001太空漫游", "0615-2001-tai-kong-man-you"],
  ["0623 大开眼戒", "0623-da-kai-yan-jie"],
  ["0625 青梅竹马", "0625-qing-mei-zhu-ma"],
  ["0627 本命年", "0627-ben-ming-nian"],
  ["0704 毕业生", "0704-bi-ye-sheng"],
  ["0720 邪修西红柿炒鸡蛋", "0720-xie-xiu-xi-hong-shi-chao-ji-dan"]
]);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function unwrapXmlValue(value = "") {
  const trimmed = value.trim();
  const cdata = trimmed.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1] : decodeXml(trimmed);
}

function field(xml, name) {
  const escapedName = name.replace(":", "\\:");
  const match = xml.match(new RegExp(`<${escapedName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedName}>`));
  return unwrapXmlValue(match?.[1]);
}

function categoriesFrom(itemXml) {
  return [...itemXml.matchAll(/<category\s+([^>]*)>([\s\S]*?)<\/category>/g)]
    .filter((match) => /\bdomain=["']category["']/.test(match[1]))
    .map((match) => unwrapXmlValue(match[2]));
}

function parseCategories(xml) {
  return [...xml.matchAll(/<wp:category>([\s\S]*?)<\/wp:category>/g)].map((match, index) => {
    const categoryXml = match[1];
    return {
      name: field(categoryXml, "wp:cat_name"),
      parent: field(categoryXml, "wp:category_parent"),
      order: index + 1
    };
  });
}

function parsePosts(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((match) => {
      const itemXml = match[1];
      return {
        id: field(itemXml, "wp:post_id"),
        type: field(itemXml, "wp:post_type"),
        status: field(itemXml, "wp:status"),
        title: field(itemXml, "title"),
        date: field(itemXml, "wp:post_date").replace(" ", "T"),
        content: field(itemXml, "content:encoded"),
        categories: categoriesFrom(itemXml)
      };
    })
    .filter((item) => item.type === "post" && item.status === "publish");
}

function youtubeId(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{6,})/);
  return match?.[1] ?? null;
}

function youtubeFrame(id) {
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
    "</div>"
  ].join("\n");
}

function cleanWordPressContent(content) {
  let output = content.replace(
    /<!--\s+wp:embed[\s\S]*?-->([\s\S]*?)<!--\s+\/wp:embed\s+-->/g,
    (wholeBlock, embedBody) => {
      const url = embedBody.match(/https?:\/\/[^\s<>]+/)?.[0] ?? "";
      const id = youtubeId(url);
      return id ? youtubeFrame(id) : embedBody;
    }
  );

  output = output
    .replace(/<!--\s+\/?wp:[\s\S]*?-->/g, "")
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return output;
}

function indent(value, spaces) {
  const prefix = " ".repeat(spaces);
  return value.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

function renderFolder(template, category) {
  const title = escapeHtml(category.name);
  return template
    .replace('<body data-page-type="folder">', `<body data-page-type="folder" data-page-order="${category.order}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title} — lilykekerun</title>`)
    .replace(/(<h1\b[^>]*data-page-title[^>]*>)[\s\S]*?(<\/h1>)/, `$1${title}$2`);
}

function renderPost(template, post) {
  const title = escapeHtml(post.title);
  const content = cleanWordPressContent(post.content);
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title} — lilykekerun</title>`)
    .replace(/(<h1\b[^>]*data-page-title[^>]*>)[\s\S]*?(<\/h1>)/, `$1${title}$2`)
    .replace(/<time\b[^>]*datetime="[^"]*"[^>]*>[\s\S]*?<\/time>/, `<time datetime="${escapeHtml(post.date)}">${escapeHtml(post.date.slice(0, 10).replaceAll("-", ".") + " " + post.date.slice(11, 16))}</time>`)
    .replace(/(<article class="article-body">)[\s\S]*?(<\/article>)/, `$1\n${indent(content, 8)}\n      $2`);
}

function assertAvailable(targetPath) {
  if (fs.existsSync(targetPath)) {
    throw new Error(`Target already exists: ${path.relative(siteRoot, targetPath)}`);
  }
  const resolvedParent = path.resolve(path.dirname(targetPath));
  if (!resolvedParent.startsWith(`${sourceRoot}${path.sep}`) && resolvedParent !== sourceRoot) {
    throw new Error(`Target escapes src: ${targetPath}`);
  }
}

function main() {
  if (!process.argv[2] || !fs.existsSync(xmlPath)) {
    throw new Error("Pass the WordPress XML export path as the first argument.");
  }

  const xml = fs.readFileSync(xmlPath, "utf8");
  const categories = parseCategories(xml);
  const posts = parsePosts(xml);
  const folderTemplate = fs.readFileSync(path.join(sourceRoot, "templates", "folder.html"), "utf8");
  const postTemplate = fs.readFileSync(path.join(sourceRoot, "templates", "post.html"), "utf8");
  const categoryPaths = new Map();
  const plannedFiles = [];

  for (const category of categories) {
    if (category.parent) {
      throw new Error(`Nested WordPress category is not mapped: ${category.name}.`);
    }
    const slug = categorySlugs.get(category.name);
    if (!slug) throw new Error(`Missing English category slug for: ${category.name}.`);
    const filePath = path.join(sourceRoot, slug, "index.html");
    assertAvailable(filePath);
    categoryPaths.set(category.name, path.dirname(filePath));
    plannedFiles.push({ filePath, html: renderFolder(folderTemplate, category) });
  }

  for (const post of posts) {
    if (post.categories.length > 1) {
      throw new Error(`Post has multiple categories and needs a unique parent: ${post.title}.`);
    }
    const categoryName = post.categories[0] ?? "Uncategorized";
    const categoryPath = categoryPaths.get(categoryName);
    if (!categoryPath) throw new Error(`Post category was not exported: ${categoryName}.`);
    const slug = postSlugs.get(post.title) ?? `post-${post.id}`;
    const filePath = path.join(categoryPath, slug, "index.html");
    assertAvailable(filePath);
    plannedFiles.push({ filePath, html: renderPost(postTemplate, post) });
  }

  for (const planned of plannedFiles) {
    fs.mkdirSync(path.dirname(planned.filePath), { recursive: true });
    fs.writeFileSync(planned.filePath, planned.html, "utf8");
  }

  console.log(`Imported ${categories.length} folders and ${posts.length} posts.`);
  console.log("Run npm run build to generate navigation and paths.");
}

try {
  main();
} catch (error) {
  console.error(`Import failed: ${error.message}`);
  process.exitCode = 1;
}
