# lilykekerun.github.io

个人静态网站。所有网站内容都在 `src/` 中。

```text
src/       网站页面、文章、文件夹、样式和模板
inbox/     新文章的 Markdown 入口
scripts/   新建文章和更新网站的脚本
```

## 首次使用

在 WSL 中进入项目目录并安装依赖：

```bash
npm install
```

## 新建文章

把 Markdown 放进 `inbox/`，格式说明见 [`inbox/README.md`](inbox/README.md)，然后运行：

```bash
npm run new-post
```

## 更新网站

移动、删除或重命名 `src/` 中的文章和文件夹后运行：

```bash
npm run build
```

## 本地预览

```bash
python3 -m http.server 8000 --directory src
```

浏览器访问 `http://localhost:8000/`。

## 发布

Push 到 `main` 后，GitHub Actions 会自动构建并只发布 `src/`：

```bash
git push origin main
```

首次使用时，在仓库 `Settings → Pages → Source` 中选择 `GitHub Actions`。
