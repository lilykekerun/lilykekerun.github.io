# lilykekerun.github.io

一个不依赖前端框架的静态个人网站，可直接部署到 GitHub Pages。

## 自动构建

网站使用真实文件夹作为英文 URL，每个页面的中文显示名称保存在自己的
HTML 中。构建器会自动扫描目录并更新：

- `home / demo / demo1` 面包屑及链接
- 文件夹卡片与文章列表
- `01 folder`、`02 posts` 等数量
- 文章返回链接
- 浏览器 `<title>`
- 页面移动后的首页、CSS 和主题脚本相对路径

不需要运行 `npm install`，因为构建器没有第三方依赖。

在 Windows PowerShell 中运行：

```powershell
npm.cmd run build
```

在命令提示符、macOS 或 Linux 终端中运行：

```sh
npm run build
```

构建会直接更新网站目录中的 HTML。执行结束后会显示扫描页数和实际更新页数；
连续运行两次时，第二次应显示 `updated 0`。

## 新建文件夹

1. 使用英文路径名创建目录，例如 `demo/reading-notes/`。
2. 将 `templates/folder.html` 复制为该目录的 `index.html`。
3. 修改其中唯一的 `<h1 data-page-title>`，它可以是中文。
4. 运行构建命令。

示例：

```html
<body data-page-type="folder">
  <h1 class="page-title" data-page-title>阅读笔记</h1>
</body>
```

## 新建文章

1. 使用英文路径名创建文章目录，例如 `demo/reading-notes/my-first-note/`。
2. 将 `templates/post.html` 复制为该目录的 `index.html`。
3. 修改 `<h1 data-page-title>`、`datetime` 日期和正文。
4. 运行构建命令。

示例：

```html
<body data-page-type="post">
  <h1 class="article-title" data-page-title>我的第一篇笔记</h1>
  <time datetime="2026-07-21">2026.07.21</time>
</body>
```

日期显示文字会根据 `datetime="2026-07-21"` 自动生成为 `2026.07.21`，不需要维护两份日期。

文章列表默认按照 WordPress 的完整发布时间 `<time datetime="YYYY-MM-DDTHH:mm:ss">`
从新到旧排列，并显示到分钟。文件夹默认按
英文路径名排列；需要手动调整文件夹顺序时，可以在 `<body>` 上添加数字：

```html
<body data-page-type="post" data-page-order="10">
```

## 哪些内容可以修改

直接修改：

- `<h1 data-page-title>` 中的中文名称
- 文章日期和正文
- 英文目录名称
- `site.config.mjs` 中的全站文字变量
- `assets/styles.css` 中的颜色变量

不要手工修改这些注释之间的内容，因为每次构建都会覆盖：

```html
<!-- AUTO:BREADCRUMB:START -->
<!-- AUTO:BREADCRUMB:END -->

<!-- AUTO:CHILDREN:START -->
<!-- AUTO:CHILDREN:END -->

<!-- AUTO:BACKLINK:START -->
<!-- AUTO:BACKLINK:END -->
```

## 当前目录

```text
/
├── uncategorized/                 # Uncategorized（空）
├── film-reviews/                  # 影评（8 篇）
├── reflections/                   # 感受（1 篇）
├── notes/                         # 杂记（1 篇）
├── book-reviews/                  # 书评（空）
└── demo/
    └── demo1/
        └── minimal-web/
```

## WordPress XML 导入

当前内容由 `ref/lilykekerun.WordPress.2026-07-21.xml` 导入。导入器会：

- 导入所有 WordPress 分类，包括空分类
- 只导入已发布的 `post`，不导入主题模板和导航等内部对象
- 使用英文或拼音目录名，保留 HTML 中的中文标题
- 保留段落、斜体、引用和列表
- 删除 Gutenberg 编辑器注释
- 将 YouTube Gutenberg 嵌入转换为本站播放器
- 在目标已存在时停止，避免覆盖现有文章

如需在一份全新网站副本中重新导入，可运行：

```powershell
npm.cmd run import:wordpress
npm.cmd run build
```

原 WordPress `首页` 是一个主题首页页面；本站已经有自己的主页，因此没有把它作为文章重复导入。

## 本地预览

构建后，在仓库目录运行任意静态文件服务器，例如：

```sh
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。
