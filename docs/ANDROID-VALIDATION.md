# v1.2.0 Android 验证

## 环境和构建

Node 24、JDK 21、Capacitor 8、AGP 8.13.0、Gradle 8.14.3、SDK 36 / Build Tools 36.0.0；最低 SDK 24。

前端 Web 使用 `/StudyOS/` 和完整 PWA 缓存；Android 使用 `./`、内置资源、无远程 server.url、无 Web Service Worker。数据库为 studyos v3，JSON 导出格式 v3，支持 v1/v2 历史备份。

## 已实际执行的本地检查

- `npm run typecheck`、`npm run lint` 通过。
- `npm test`：95 项单元/集成测试通过。
- `npm run build`、`npm run build:android:web` 通过。
- `npm run test:e2e`：17 项 Web/PWA 回归通过。
- `npm run test:android:web`：11 项 Android 资源、手机宽度、跨来源迁移和新增功能浏览器测试通过。
- `npm audit --audit-level=low`：0 个已知漏洞。
- Android 原生 Debug 工程实际编译成功；正式签名未提供时 assembleRelease 必须拒绝执行。

浏览器测试覆盖 360 / 375 / 390 / 412 / 432px，及原有平板、桌面、深色、PWA 更新、离线、时区和夏令时。新增业务测试覆盖 CSV/XLSX 真文件解析、去重与冲突、预览确认、计划原子写入、番茄跨阶段/暂停/幂等结算、原生调度调用、通知栏/存储记录格式差异、已触发提醒的清理和保留、权限拒绝降级、偏好持久化和 v2 → v3 数据迁移。

## 原生模拟器检查

CI 使用 API 35 x86_64 / Pixel 6 / KVM，安装真实 APK。16 项实际原生检查已通过，执行证据：[PR 原生验证 42381002548](https://github.com/J-Ruan/StudyOS/actions/runs/42381002548)。后续最终提交校验见 [PR #2 Checks](https://github.com/J-Ruan/StudyOS/pull/2/checks)。源码配置本身不算执行证据。

检查脚本包括：同一测试签名的 v1.1.0 原地覆盖升级（不清除应用数据）、11 类历史实体与计划迁移、离线启动、课程/任务、系统返回、实际通知权限、AlarmManager 触发、通知栏点击、专注通知暂停、锁屏与前后台恢复、原生 ACTION_CREATE_DOCUMENT 保存、原生 Documents JSON 和 XLSX 导入、主题、冷启动及横屏。

本机没有 /dev/kvm，不将本机浏览器模拟宽度冒充 Android 模拟器。真实手机、系统重启后的提醒恢复、各厂商省电策略和 Android 7 的通知偏好兼容尚未验证。重启恢复依赖官方插件声明的 Boot Receiver；强制停止不承诺后台提醒。

## 发布保护

正式 Release 必须使用固定正式密钥，执行 `apksigner verify` 和 `android-verify.mjs --release`；禁止用 Debug 附件替代。Release 需包含 SHA256SUMS.txt。PR 使用 Debug APK 验证，不读取正式密钥；升级测试中的 v1.1.0 APK从历史标签源码构建，专门使用同一运行器的测试签名，不重新签名或覆盖历史公开附件。

历史 v1.1.0 的验证记录保存在 [ANDROID-VALIDATION-v1.1.0.md](ANDROID-VALIDATION-v1.1.0.md)。
