# Claude 工作流

## 分支策略

- Claude 只负责将改动推送到功能分支 `claude/vigilant-allen-0yscji`
- **不自动创建 PR，不合并到 main**
- 用户自己在 GitHub 上创建 PR 并合并

## 上传流程

1. 用户上传修改好的文件
2. Claude 将文件复制到 `/home/user/skills-github-pages/`
3. Claude commit 并 push 到功能分支
4. 用户在 GitHub 上合并 PR → 内容上线到 GitHub Pages

## 站点

`https://jarixhew-bit.github.io/skills-github-pages/`
