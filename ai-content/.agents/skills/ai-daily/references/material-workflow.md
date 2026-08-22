# 日报素材操作说明

从 `D:\codeproject\aibyte\ai-content` 运行以下命令。先人工查看候选画面：它必须直接服务于对应新闻、主体清晰、文字可读、没有明显空白或截断；任一条件不满足就不使用图片。

## 登记一张已选素材

为图片准备一个临时元数据文件，例如 `material-01.json`：

```json
{
  "role": "illustration",
  "content": "画面呈现的新闻对象与关键信息",
  "videoUse": "口播讲到哪一句时使用，以及镜头如何处理",
  "relevant": true,
  "clear": true,
  "source": "来源页地址，可省略"
}
```

运行：

```powershell
node .\.agents\skills\ai-daily\scripts\register-daily-material.mjs YYYY-MM-DD 排名 图片路径 material-01.json
```

脚本会复制素材并按文章顺序编号：第 1 张第 01 条图片为 `assets/01.jpg`，同条下一张为 `assets/01-1.jpg`；第 02 条的首图为 `assets/02.jpg`。它也会同步更新 `materials.json` 与 `assets/materials.md`。HTML 仍需由 Agent 将这张图只插入对应新闻卡一次。

## 交付前检查

```powershell
node .\.agents\skills\ai-daily\scripts\validate-daily-output.mjs YYYY-MM-DD
```

检查项包括必备文件、`preview.png`、公众号 HTML 中的 X 链接、素材命名、素材文件、人工相关性/清晰度确认、HTML 引用和素材说明。该脚本不能判断新闻与画面是否真的相关，必须在登记前由 Agent 人工判断。
