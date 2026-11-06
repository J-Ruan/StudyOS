# 学序 v1.1.0 · Android APK

[Android 安装、签名与数据迁移说明](https://github.com/J-Ruan/StudyOS/blob/v1.1.0/docs/ANDROID.md)

本版本在原有 StudyOS 中增加可独立安装的 Android APK，共用现有 React 页面、业务逻辑和数据库格式。原 Web 版本、GitHub Pages 子路径及离线 PWA 保留。

## 下载

- Android 手机：选择 Assets 中的 `.apk` 文件，下载后安装。
- Web 静态托管：选择 `StudyOS-v1.1.0.zip`。
- 文件名含 `android-debug.apk` 的附件使用 **Debug 签名**；正式签名状态由本次构建结果附在下方，请在安装前查看。

## 本次新增

- Capacitor 8 Android 工程，包名 `com.jruan.studyos`；最低 Android 7.0，目标 Android API 36。
- 完整前端资源内置于 APK，首次安装即可离线启动，不加载远程 GitHub Pages 页面作为主界面。
- 系统返回、主题状态栏、键盘与安全区域适配；Android 原生文件保存/分享入口。
- 日程、任务、专注、统计、考试、习惯、资料和周度复盘继续复用现有代码。
- IndexedDB `studyos` v2 和 JSON v2 备份兼容，支持 Web 与 APK 之间手动迁移。
- Android 构建、签名检查、APK 归档与模拟器验证纳入发布门槛。

## 数据和更新

Web 与 APK 的本地数据库相互独立，不自动同步。迁移时先从旧平台导出 JSON，再在新平台导入；备份包含课程资料。

安装更新前请导出备份。Debug 密钥可能随构建环境改变，签名不一致时需要先备份、卸载旧版再安装；卸载会删除应用本地数据。后台声音受系统限制，重新打开后按时间戳校准计时，不保证被系统彻底终止后的定时提醒。
