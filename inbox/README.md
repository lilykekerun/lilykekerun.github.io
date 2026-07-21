# Article inbox

把准备发布的 Markdown 保存为 `inbox/article.md`，然后在项目根目录运行：

```powershell
npm.cmd run new-post
```

脚本成功后不会删除或修改这里的 Markdown 文件。

Markdown 可以使用：

- `# 一级标题`：默认作为文章标题，不会在正文中重复显示
- `*斜体*`、`**粗体**`
- 普通列表及多层列表
- 行内代码和围栏代码块
- Markdown 链接与图片
- 表格和删除线
- 单独占一行的 YouTube 链接：自动转换为内嵌播放器

示例：

````markdown
# 文章标题

这里是正文，有 *斜体* 和 `inline code`。

- 第一项
  - 第二层

```js
console.log("hello");
```

https://youtu.be/nJofCdlsDFY
````
