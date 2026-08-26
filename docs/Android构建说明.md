# Android App 构建

Android App 基于 Capacitor 8，复用 Web 的完整任务、日程、笔记、统计、工具箱、目标和设置功能，并增加系统本地通知、文件分享与移动端布局。

## 环境

- Node.js 22+
- Android Studio 2025.2.1 或更新版（使用其内置 JDK）
- Android SDK，最低 Android 7.0 / API 24

## 构建

```bash
npm install
npm run android:sync
npm run android:open
```

在 Android Studio 中等待 Gradle 同步，然后选择 Build → Generate Signed App Bundle or APK。生成发布签名后构建 AAB 或 APK。

首次打开 App，在登录页填写 HTTPS API 地址，例如 `https://workbench.example.com/api`，再输入服务器账号密码。HTTP 明文地址默认被禁止。

## 通知

App 会同步未来 60 天、最多 200 条任务/日程提醒。任务默认在截止前 30 分钟通知，单个任务可以覆盖提醒时长；每次新建、编辑、删除或从服务器同步任务后都会重新调度。Android 13+ 会请求通知权限；精确提醒受系统“闹钟和提醒”权限及省电策略影响。点击通知会打开对应详情。

## 关键位置

- `capacitor.config.json`：App ID、名称和 Web 目录
- `android/`：可直接在 Android Studio 打开的原生工程
- `src/services/native.js`：原生通知桥接
- `android/app/src/main/AndroidManifest.xml`：网络和精确提醒权限
