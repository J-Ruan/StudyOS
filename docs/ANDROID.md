# 学序 Android APK

**[打开 v1.1.0 下载页](https://github.com/J-Ruan/StudyOS/releases/tag/v1.1.0)**。在 Assets 中选择以 `.apk` 结尾的附件；Web ZIP 不能作为 Android 安装包。

- `StudyOS-v1.1.0-android.apk`：使用仓库提供的正式 Release 密钥签名。
- `StudyOS-v1.1.0-android-debug.apk`：未提供完整正式签名时生成的可安装 Debug APK，文件名与 Release 说明均会标注签名状态。

上面的链接是已经发布的 v1.1.0。v1.2.0 使用更严格的正式签名发布门槛：缺少任一签名 Secret 时，不发布新 Release，不用 Debug 代替正式 APK；请以仓库实际 Release 为准。

## 安装与首次使用

1. 在手机浏览器下载 APK。只从本项目仓库的 Release 页面取得安装包。
2. 点击下载的 APK，按系统提示为该浏览器或文件管理器允许「安装未知应用」，完成安装。
3. 打开「学序」。安装包已经包含完整页面和资源，首次打开无需联网，不需要账号。
4. 设置学期后添加课程和任务。首次安装是空数据库，不会自动插入演示数据。

最低系统为 **Android 7.0（API 24）**，需要系统可用的现代 Android System WebView。应用包名为 `com.jruan.studyos`，v1.2.0 的 `versionCode` 为 120（旧 v1.1.0 为 110）。

## 与 Web 共用的代码

APK 通过 Capacitor 8 运行打包在 `android/app/src/main/assets/public/` 中的 React 生产资源。未配置远程 `server.url`，不依赖 GitHub Pages 加载主界面。

| 平台      | 构建命令                    | 资源目录        | 资源基础路径 | Service Worker           |
| --------- | --------------------------- | --------------- | ------------ | ------------------------ |
| Web / PWA | `npm run build`             | `dist/`         | `/StudyOS/`  | 原有版本化缓存与更新机制 |
| Android   | `npm run build:android:web` | `dist-android/` | `./`         | 不生成、不注册           |

课程、任务、考试、习惯、专注、统计和周度复盘继续使用现有组件与业务逻辑。IndexedDB 名称仍为 `studyos`，新增正式数据库 v3 升级和 plans 表，保留 v1 → v2 迁移。原有课程、任务、考试、习惯、记录、资料及复盘不清空；旧自习安排迁为稳定编号计划。JSON v3 包含新字段，Zod 校验并兼容历史 v1/v2。

## Web 数据迁入 APK

**浏览器、PWA 与 APK 使用不同的存储来源，数据不会自动同步。** 同一个数据库名称不代表共享数据库。

1. 在 Web 版本「我的 → 数据与备份」导出 JSON，先结束并保存正在进行的计时。
2. 将 JSON 保存到手机可访问的位置。
3. 在 APK 的同一页面导入该文件，选择合并或覆盖。
4. 核对课程、任务、学习记录与资料。

备份包含课程文件的二进制内容，不依赖网页中的临时对象链接。合并按编号保留本机内容并去重；覆盖恢复需确认；无效备份或写入失败会回滚原数据库。APK 备份也可以按相同流程导入 Web 版本。

## APK 备份与文件操作

- 「导出备份」使用 Android ACTION_CREATE_DOCUMENT 系统保存界面，由你选择保存位置，取消不会更新最近导出时间。
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

不要在 Issues、PR、聊天或构建日志中填写这些值。工作流只有在四项均存在、且不是 Pull Request 时才解码到运行器临时目录，构建 Release APK 并清理临时文件；缺少任意一项时仍可进行 Debug 构建和模拟器检查，但禁止正式发布。Pull Request 不使用签名密钥。

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

PR、`main`、新版本标签和手动触发均会执行 Android 构建。Web 校验、Android APK 构建检查、同签名旧版覆盖升级、模拟器验证和正式签名验证通过后，`v*` 标签工作流才创建新 Release，附带 Web ZIP、正式签名 APK 和 SHA256SUMS.txt。版本标签必须与 `package.json` 对应，已有正式 Release 会拒绝覆盖。

GitHub Pages 延续原来的 Web 构建与部署任务，不使用 Android 相对路径产物。Android 工程不会更改 Web 用户数据。

## 权限和限制

- 不要求广泛存储、定位、联系人或账号权限。
- Android 清单保留网络能力以响应用户主动打开的外部链接；应用主界面和学习数据不依赖网络。
- 系统返回键优先处理弹窗和未保存编辑，再处理子页面；主页面使用最小化行为。
- 后台恢复和重新打开时根据持久化时间戳校准计时。暂停和休息不计入学习，同一会话不会重复保存。
- 系统通知通过官方 Local Notifications 插件的原生调度执行，并使用其 Boot Receiver 恢复待办提醒。任务修改、完成、删除和设置变化会同步取消/重排，提醒数量最多保留最近 64 项。
- Android 13+ 由用户授权通知；精确闹钟是独立可选权限，未授权时明确使用普通调度，不自动弹精确权限页。系统强制停止、厂商省电和系统权限变化仍可能延迟/取消通知。
- 专注通知显示阶段与预计结束时间；暂停、继续、结束操作会打开应用并执行真实事务，没有常驻后台服务。锁屏内容遵循系统隐私设置。Android 7 的通知声音/振动可能受系统全局设置影响；此项尚未真机验证。
- 番茄循环每组包含指定轮数及最后一次长休息，之后停止。自动模式按真实时间轴补齐本组，手动模式在下一阶段等待继续；休息不记学习时间。
- Web 与 APK 不自动同步。卸载、清除应用数据或存储故障会影响本地数据，请保留外部备份。

实际运行与验证范围见 [Android 验证记录](ANDROID-VALIDATION.md)。浏览器自动化、模拟器和真机结果分别记录，不互相替代。

## v1.2.0 操作入口

- 底部为今天、课程、任务、专注、我的。旧 `/schedule/tasks` 等内部链接继续有效；统计、考试、学习计划、习惯和复盘可从「我的」进入。
- 课程默认今日视图，支持三日和周视图；滑动从屏幕中间开始，避开系统边缘返回手势。周表内部可以横向滚动。
- 新建任务只填标题和截止时间；更多选项可设置课程、优先级、重复、子任务、备注及多项提醒。长按有快捷菜单；批量删除必须确认。
- 「课程 → 自习安排」提供离线计划生成，先选时间范围，再预览调整，确认保存。手动计划也可关联任务、开始专注或单独标记完成；不会自行完成任务。
- 「课程 → 导入课表」本地解析 CSV 或 XLSX 的第一个工作表。选择标题行、映射字段、检查重复和冲突、确认后事务导入；最多 5 MB / 2000 行 / 100 列。可下载 CSV 模板。
- 「我的 → 使用偏好」保存启动页、四种强调色、专注循环、通知和默认学习时间。修改后点击保存。

## 仓库所有者首次配置固定签名

如果正式密钥已存在，请继续使用原密钥，不要重新生成。首次建立正式签名时，在自己长期保管且可备份的电脑上执行（命令会交互请求密码）：

```bash
keytool -genkeypair -keystore /安全目录/studyos-release.jks -alias studyos-release -keyalg RSA -keysize 3072 -validity 10000
base64 -w 0 /安全目录/studyos-release.jks > /安全目录/studyos-release.base64
```

然后在 GitHub 仓库 **Settings → Secrets and variables → Actions → New repository secret** 添加本页四项 Secrets。`ANDROID_KEYSTORE_BASE64` 使用该 Base64 文件的内容，另外三项分别是 keystore 密码、alias、条目密码。妥善离线备份 keystore 和密码，不要提交 Git，不要贴到聊天或 Issues；Base64 不是加密。

可先在 Actions 选择「校验与发布」手动运行 main。确认「构建正式签名 Release APK」「检查正式签名 APK」均通过，再在目标提交创建尚未发布的 `v1.2.0` 标签。标签必须与 package.json 对应；CI 会在全部校验通过后创建正式 Release。对照 SHA256SUMS.txt 校验下载的 APK。
