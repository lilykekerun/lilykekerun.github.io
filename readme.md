# lilykekerun.github.io

一个不依赖框架的静态个人网站 demo，可直接部署到 GitHub Pages。

## 页面结构

- `index.html`：A，主页文件夹列表
- `collections/index.html`：B，多层文件夹页
- `collections/notes/index.html`：C，文章列表页
- `collections/notes/minimal-web/index.html`：D，文章正文页

所有颜色在 `assets/styles.css` 顶部通过 CSS 变量管理；主题选择由
`assets/theme.js` 写入浏览器的 `localStorage`。

## 本地预览

在仓库目录运行任意静态文件服务器，例如：

```sh
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。
