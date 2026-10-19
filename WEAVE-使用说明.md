# Weave Windows 桌面版使用说明

## 启动

收到 `Weave-Windows.zip` 时，先完整解压，再双击 `Weave` 文件夹中的 `Weave.exe`。收到文件夹时直接双击其中的 `Weave.exe`。不能只复制这个 EXE，也不能在压缩包内直接运行：`resources`、DLL、语言包等文件必须一起保留。接收方无需安装 Node.js、npm 或 Electron。

这是便携目录交付，不是安装程序。程序未经过代码签名，Windows 可能显示来源提示；请核对交付来源。浏览器预览与桌面应用不同，文件夹访问、下载监听和桌面通知等功能应在桌面版中验证。

## 项目与素材

在桌面应用中创建或打开项目文件夹。导入素材前，确认当前接收项目及镜头；根据界面提供的入口拖入、粘贴或导入文件。项目文件夹与程序文件夹分开保存，备份时复制整个项目文件夹，包含原始素材及项目记录。移动项目后，从新位置重新打开。

共享盘项目可以作为协作方式进行测试，但尚不能仅凭本机测试认定多人协作可靠。正式使用前，应在至少两台电脑上验证同时添加素材、修改同一记录的冲突提示、网络断开与恢复、权限以及活动提醒。共享目录不应存放权威 SQLite 数据库；本版本的项目后端使用 JSON 文件。发现异常时先保留整个项目备份。

## 开发与打包

以下命令供维护者使用；交付给接收方的目录不依赖全局 Node/npm。先完成页面构建，确保 `dist/client/index.html` 是本次版本，并准备 `electron/main.cjs` 与 `electron/preload.cjs`。升级 Electron 后，先用开发环境自带的 Node 运行 `node_modules/electron/install.js`，等待官方下载及解压完成；脚本会核对包版本与运行时版本，避免将旧运行时误打包。使用开发环境自带的 Node 执行：

```powershell
node scripts/package-desktop.mjs
```

追加 `--zip` 可生成 `release/Weave-Windows.zip`。如果该 ZIP 已存在，请先移走或删除旧 ZIP。脚本不会调用全局 npm，会复制已安装的官方 Electron 运行时、页面构建、桌面代码以及 archiver、chokidar 的运行时依赖。不同版本的依赖按需要保留在嵌套目录中，复制时展开 pnpm 链接。输出为 `release/Weave`；仅会替换带有本脚本标记的旧交付目录，不会清理整个 `release`。

启动开发目录中的已构建桌面版本：

```powershell
node scripts/start-desktop.mjs
```

此启动脚本设置 `WEAVE_FORCE_PRODUCTION=1`，桌面主入口须识别该变量并加载构建页面。需要连接已运行的开发页面时，设置 `WEAVE_DEV_URL` 为其地址后执行启动脚本。打包版通过 `resources/app` 加载，Electron 的 `app.isPackaged` 为真，不需要额外设置环境变量。

打包脚本会检查入口、页面、依赖解析和链接残留。结构检查通过不等于实际桌面验收：交付前仍需在没有 Node/npm 的 Windows 环境中双击启动，并验证创建/打开项目、导入、预览、删除、导出及重启后的数据恢复。

## 软件更新

Windows 便携版启动后会检查公开 GitHub Releases；发现新版后自动下载至 Windows「下载」文件夹，并校验发布的 SHA-256。下载完成后需关闭 Weave、将 ZIP 中的 `Weave` 程序文件夹解压并覆盖旧的 `Weave` 程序文件夹。项目目录与程序目录分开，不要覆盖项目文件夹。更新失败或目标位置不可写时，旧版本不会被自动替换；可手动下载最新 ZIP。
