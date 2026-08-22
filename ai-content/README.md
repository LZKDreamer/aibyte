# AI Content

`ai-content` 是日报与长文共用的内容工程目录。当前已接入 AI 日报流程：候选采集在 `../research-pipeline`，成稿与来源、素材清单在本目录的 `output/daily/YYYY-MM-DD/`。

生成日报草稿目录：

```powershell
node .\scripts\create-daily-output.mjs 2026-08-22
```

不要把视频、原始大文件或全站抓取素材放进这个目录或未来的 GitHub 内容仓库。
