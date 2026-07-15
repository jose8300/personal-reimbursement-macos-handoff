# macOS 提示“已损坏，无法打开”时怎么办

如果双击 `start.command` 时看到类似提示：

```text
“start.command”已损坏，无法打开。你应该将它移到废纸篓。
```

这通常不是文件真的坏了，而是 macOS 对从飞书、微信、浏览器下载的脚本加了安全隔离标记。

## 推荐修复方式

1. 打开 macOS 自带的“终端”。
2. 输入 `cd `，注意 `cd` 后面有一个空格，不要回车。
3. 把解压后的项目文件夹拖进终端窗口。
4. 回车。
5. 复制下面这行命令，粘贴到终端后回车：

```bash
xattr -dr com.apple.quarantine .
chmod +x start.command
./start.command
```

之后浏览器打开：

```text
http://127.0.0.1:5173/
```

## 如果还是打不开

继续在这个项目文件夹里执行：

```bash
npm ci
npm run dev
```

然后打开：

```text
http://127.0.0.1:5173/
```

## 为什么会这样

macOS 会对来自聊天软件或浏览器下载的脚本做额外拦截。有时它不会显示“来自未知开发者”，而是显示“已损坏”。清除 `com.apple.quarantine` 隔离标记后，本地脚本就可以正常运行。
