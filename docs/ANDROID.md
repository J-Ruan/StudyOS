# 学序 Android APK

**[打开 v1.1.0 下载页](https://github.com/J-Ruan/StudyOS/releases/tag/v1.1.0)**。在 Assets 中选择以 `.apk` 结尾的附件；Web ZIP 不能作为 Android 安装包。

- `StudyOS-v1.1.0-android.apk`：使用仓库提供的正式 Release 密钥签名。
- `StudyOS-v1.1.0-android-debug.apk`：未提供完整正式签名时生成的可安装 Debug APK，文件名与 Release 说明均会标注签名状态。

实际发布附件取决于构建时可用的签名配置，请以下载页为准。

## 安装与首次使用

1. 在手机浏览器下载 APK。只从本项目仓库的 Release 页面取得安装包。
2. 点击下载的 APK，按系统提示为该浏览器或文件管理器允许「安装未知应用」，完成安装。
3. 打开「学序」。安装包已经包含完整页面和资源，首次打开无需联网，不需要账号。
4. 设置学期后添加课程和任务。首次安装是空数据库，不会自动插入演示数据。

最低系统为 **Android 7.0（API 24）**，需要系统可用的现代 Android System WebView。应用包名为 `com.jruan.studyos`，v1.1.0 的 `versionCode` 为 110。

## 与 Web 共用的代码

APK 通过 Capacitor 8 运行打包在 `android/app/src/main/assets/public/` 中的 React 生产资源。未配置远程 `server.url`，不依赖 GitHub Pages 加载主界面。

| 平台      | 构建命令                    | 资源目录        | 资源基础路径 | Service Worker           |
| --------- | --------------------------- | --------------- | ------------ | ------------------------ |
| Web / PWA | `npm run build`             | `dist/`         | `/StudyOS/`  | 原有版本化缓存与更新机制 |
| Android   | `npm run build:android:web` | `dist-android/` | `./`         | 不生成、不注册           |

课程、任务、考试、习惯、专注、统计和周度复盘继续使用现有组件与业务逻辑。IndexedDB 名称仍为 `studyos`，实体结构、v1 → v2 迁移、Zod 校验和 JSON 格式 v2 保持兼容。

## Web 数据迁入 APK

**浏览器、PWA 与 APK 使用不同的存储来源，数据不会自动同步。** 同一个数据库名称不代表共享数据库。

1. 在 Web 版本「我的 → 数据与备份」导出 JSON，先结束并保存正在进行的计时。
2. 将 JSON 保存到手机可访问的位置。
3. 在 APK 的同一页面导入该文件，选择合并或覆盖。
4. 核对课程、任务、学习记录与资料。

备份包含课程文件的二进制内容，不依赖网页中的临时对象链接。合并按编号保留本机内容并去重；覆盖恢复需确认；无效备份或写入失败会回滚原数据库。APK 备份也可以按相同流程导入 Web 版本。

## APK 备份与文件操作

- 「导出备份」使用 Android 原生系统分享面板。可选择文件管理器、系统保存入口或其他用户主动选择的目标。
- 导入 JSON 与上传课程资料通过系统文件选择器完成，不要求访问全部文件。
- 课程本地文件通过原生文件分享交给支持该格式的应用处理；外部网页和 Obsidian 链接由系统打开。没有相应应用时会提示错误。
- 单个资料文件限制 20 MB，备份导入限制 150 MB。请另行保管较大的资料。

应用自身不上传学习数据。若主动选择第三方分享目标，该目标如何处理文件由其自身政策决定。

## 更新与签名

安装更新前先导出 JSON 备份。使用相同包名、相同签名且更高 `versionCode` 的 APK 时，Android 通常允许覆盖安装，并保留本地数据。

**Debug 签名不保证跨构建一致。** 不同电脑或不同 CI 构建可能使用不同 Debug 密钥，导致无法覆盖安装。此时先备份，再卸载旧版、安装新版并导入备份。**卸载会删除 APK 的本地数据。** 从 Debug 切换到正式 Release 签名也可能需要这样处理。

正式签名密钥必须长期保管。丢失旧密钥后不能靠生成随机新密钥继续覆盖升级。不要将 keystore 或密码提交仓库，也不要将其作为公开 Release 附件。

### 正式签名配置

仓库管理员在 **Settings → Secrets and variables → Actions** 中安全添加四项 Secrets：

| Secret                      | 用途                                       |
| --------------------------- | ------------------------------------------ |
| `ANDROID_KEYSTORE_BASE64`   | 长期保管的正式 keystore 的 Base64 编码内容 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码                              |
| `ANDROID_KEY_ALIAS`         | 正式签名条目 alias                         |
| `ANDROID_KEY_PASSWORD`      | 该条目的密码                               |

不要在 Issues、PR、聊天或构建日志中填写这些值。工作流只有在四项均存在、且不是 Pull Request 时才解码到运行器临时目录，构建 Release APK 并清理临时文件；缺少任意一项时会生成明确标注的 Debug APK。Pull Request 不使用签名密钥。

本地正式签名使用同样的三个密码/alias 环境变量，以及 `ANDROID_KEYSTORE_PATH` 指向 keystore 路径，然后执行 `npm run android:release`。不会自动制造“正式”密钥，也不会在缺失配置时将未签名文件当作正式 APK。

## 本地构建

需要 Node.js 24、JDK 21、Android SDK。工程使用 **Capacitor 8、AGP 8.13.0、Gradle Wrapper 8.14.3**，`compileSdk` / `targetSdk` 为 36，Build Tools 为 36.0.0。

```bash
npm ci
npm run build:android:web
npx cap sync android
cd android
./gradlew assembleDebug
```

也可使用统一入口：

```bash
npm run android:debug
npm run android:release # 需要正式签名环境变量
```

配置 `JAVA_HOME` 指向 JDK 21，`ANDROID_HOME` / `ANDROID_SDK_ROOT` 指向 Android SDK。安装所需 SDK：

```bash
sdkmanager 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'
```

Debug APK 默认位于 `android/app/build/outputs/apk/debug/app-debug.apk`；签名 Release APK 位于 `android/app/build/outputs/apk/release/app-release.apk`。用 `node scripts/android-verify.mjs <apk路径>` 检查 APK 签名、包名、版本与内置资源。

## CI 与发布

PR、`main`、`feat/android-apk`、新版本标签和手动触发均会执行 Android 构建。Web 校验、Android APK 构建检查和模拟器验证通过后，`v*` 标签工作流才创建新 Release，附带 Web ZIP 与选定签名模式的 APK。版本标签必须与 `package.json` 对应，已有正式 Release 会拒绝覆盖。

GitHub Pages 延续原来的 Web 构建与部署任务，不使用 Android 相对路径产物。Android 工程不会更改 Web 用户数据。

## 权限和限制

- 不要求广泛存储、定位、联系人或账号权限。
- Android 清单保留网络能力以响应用户主动打开的外部链接；应用主界面和学习数据不依赖网络。
- 系统返回键优先处理弹窗和未保存编辑，再处理子页面；主页面使用最小化行为。
- 后台恢复和重新打开时根据持久化时间戳校准计时。暂停和休息不计入学习，同一会话不会重复保存。
- 系统彻底终止进程、休眠或电池优化时，不保证按时声音提醒，也没有承诺持续后台通知。
- Web 与 APK 不自动同步。卸载、清除应用数据或存储故障会影响本地数据，请保留外部备份。

实际运行与验证范围见 [Android 验证记录](ANDROID-VALIDATION.md)。浏览器自动化、模拟器和真机结果分别记录，不互相替代。
