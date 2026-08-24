# ai-daily-video

独立的 AI 日报视频生成 Skill。先执行审核包：

默认成片模板已锁定为 `AI Product Reel v1`：1080×1920、30fps、中央产品窗口、窗口下方连续动态图解和底部字幕。场景切换默认硬切；产品视频必须裁切在圆角窗口内，内部素材核验备注只保存在报告中，不渲染到画面。

```powershell
node scripts/prepare.mjs "..\..\..\ai-daily-output\ai-daily-bundle\output\2026-08-22\01\article\article.md"
```

审核通过后：

```powershell
node scripts/render.mjs "..\..\..\ai-daily-output\ai-daily-bundle\output\2026-08-22\01\article\article.md" --approved
```

运行时依赖在首次渲染时安装到 `..\..\..\ai-daily-output\ai-daily-bundle\dependency\ai-daily-video-runtime`。预览与正式渲染均需要 Node 22+、FFmpeg 和可用网络（仅用于 TTS 与安装 HyperFrames）。
