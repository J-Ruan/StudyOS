# v1.1.0 Android 验证记录

此文档区分源码检查、浏览器回归、APK 编译检查、模拟器和真实手机验证。执行结果由本次实际运行证据填写；配置了命令不等于已经执行成功。

## 构建约束

- 复用现有 React / TypeScript / Dexie 代码，数据库名称为 `studyos`，版本 v2，备份格式 v2。
- Web 构建使用 `/StudyOS/`，保留 Service Worker 缓存与更新。
- Android 构建使用 `./`，输出 `dist-android/`，不注册 Web Service Worker，不配置远程 `server.url`。
- Android 包名 `com.jruan.studyos`；v1.1.0，versionCode 110；min SDK 24，target / compile SDK 36。
- Node 24，JDK 21，Capacitor 8，AGP 8.13.0，Gradle 8.14.3，Build Tools 36.0.0。

## 验证范围

| 项目         | 检查内容                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------- |
| Web 回归     | 类型、ESLint、单元/数据集成、生产构建、原有关键路径 E2E、PWA 更新与离线启动                     |
| Android 资源 | 相对路径资源存在；不存在 `/StudyOS/assets/`；APK 内包含 HTML、CSS、JS、图标；不加载远程网页主体 |
| APK          | assembleDebug；签名验证；包名、versionName、versionCode；通用 APK 而非 AAB                      |
| 原生桥接     | 返回、未保存编辑保护、状态栏、启动页、键盘、安全区域、恢复时计时校准                            |
| 数据         | 保留 v1 → v2 升级；JSON v2 跨平台格式；无效导入回滚；不会在启动时重置数据库                     |
| 模拟器       | 安装 APK、启动、页面和数据操作、系统返回、离线、主题、横竖屏与计时恢复                          |
| 真实手机     | 需独立真机执行结果；不能用响应式宽度或模拟器冒充                                                |

## 当前实际结果

Android 工程已在本机实际编译并通过 APK 验证脚本：Debug APK 4,572,546 字节，包名 `com.jruan.studyos`，versionName `1.1.0`，versionCode `110`，min SDK 24，target SDK 36，签名校验有效；检查到 18 个内置前端资源，不包含远程 `server.url` 或 Web Service Worker。此结果只证明构建、签名和包内资源检查通过，不替代实际安装运行。

本机本轮 Debug 构建 SHA-256：`dc2f04cb20826f3564592dacf8a72c368f76b852c61775df002313a4cbc98cce`。Debug 签名证书 SHA-256：`c51370933cda9e75e300dc312b75bd1ce1a0778488bdfd9d77abada8214e9bf8`。这些是本机构建记录，不能据此假定 CI 构建会使用相同 Debug 密钥。缺少正式签名配置时，Release 构建保护按预期拒绝执行，不会产生冒充正式签名的 APK。

本机没有 `/dev/kvm`，未进行本机 Android 模拟器或真机验证。CI 已在 API 35 模拟器安装并运行真实 APK，首次断网启动、课程与任务、系统返回、后台计时、真实分享面板与缓存 JSON、系统 Documents 文件选择器导入及重复合并、深色、进程关闭后离线重启和横竖屏检查全部通过。执行证据：[PR 校验运行 42255594548](https://github.com/J-Ruan/StudyOS/actions/runs/42255594548)。这属于模拟器测试，未进行真实手机测试。本机 TypeScript、ESLint、63 项单元/集成测试、17 条原 Web/PWA 端到端测试及 6 条 Android 资源/手机宽度/跨来源 JSON 迁移测试均已执行通过。
