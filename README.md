# 传讯 · 纯爱予彻

一个单文件的微信/短信式情侣聊天网页应用（本地自托管数据，不上传服务器）。

## 部署到 GitHub Pages（推荐，这样 B 站内嵌播放不会被拦截）

1. 新建一个 GitHub 仓库（仓库名随意，例如 `chuanxun`），**Public 或 Private 都可以**（Private 也能开 Pages，但需要 GitHub 账号登录后访问）。
2. 把本文件夹里的内容上传到仓库根目录（就是 `index.html`、`.nojekyll`、`README.md` 这三个文件）。
3. 进入仓库 **Settings → Pages**：
   - Source 选 **Deploy from a branch**；
   - Branch 选 **main**（或 master），目录选 **/ (root)**；
   - 点 Save。
4. 等 1–2 分钟，页面会显示一个地址：`https://你的用户名.github.io/chuanxun/`。
5. 用手机浏览器打开这个 https 地址即可使用。

> 关键点：一定要用 **https** 的 Pages 地址打开，B 站/YouTube 的内嵌播放器才会正常加载（本地 `file://` 打开会因没有 Referer 被平台拦截）。

## 也可以本地局域网用

在文件夹里运行：

```bash
python -m http.server 8000
```

然后手机和电脑连同一个 WiFi，手机访问 `http://电脑局域网IP:8000`。

## 数据说明

- 所有数据都保存在**浏览器本地**（localforage → IndexedDB / localStorage），没有服务器、没有账号、不会上传。
- 换设备/清浏览器缓存会导致数据丢失；可用 App 内「设置 → 数据管理」导出/导入。