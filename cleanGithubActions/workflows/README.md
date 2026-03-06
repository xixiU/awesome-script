# GitHub Actions 清理工具

这个 workflow 用于自动清理仓库中旧的 GitHub Actions workflow runs，帮助保持仓库整洁。

## 功能特性

- 🕒 **自动定时清理**: 每周日凌晨 2 点自动运行
- 🎯 **手动触发**: 支持在 GitHub Actions 页面手动触发
- ⚙️ **灵活配置**: 可自定义保留天数和最小保留数量
- 🔒 **安全**: 使用 GitHub 内置的 `GITHUB_TOKEN`，无需额外配置

## 使用方法

### 自动运行

workflow 会在每周日凌晨 2 点自动运行，使用默认配置：
- 保留最近 30 天的 runs
- 每个 workflow 至少保留 5 个 runs

### 手动触发

1. 进入仓库的 **Actions** 页面
2. 选择左侧的 **Clean Old Workflow Runs** workflow
3. 点击右侧的 **Run workflow** 按钮
4. 可选：自定义参数
   - `days_to_keep`: 保留最近几天的 runs（默认 30 天）
   - `minimum_runs_to_keep`: 每个 workflow 至少保留的 runs 数量（默认 5 个）
5. 点击 **Run workflow** 确认运行

## 配置说明

### Token 配置

此 workflow 使用 GitHub 自动提供的 `GITHUB_TOKEN`，**无需手动配置**。

如果需要使用自定义 token（例如需要更高权限），可以：

1. 在 GitHub 创建 Personal Access Token
   - 进入 Settings → Developer settings → Personal access tokens → Tokens (classic)
   - 点击 Generate new token
   - 勾选 `repo` 和 `workflow` 权限
   - 生成并复制 token

2. 添加到仓库 Secrets
   - 进入仓库 Settings → Secrets and variables → Actions
   - 点击 New repository secret
   - Name: `GH_PAT`
   - Value: 粘贴你的 token
   - 点击 Add secret

3. 修改 workflow 文件中的 token 配置
   ```yaml
   token: ${{ secrets.GH_PAT }}
   ```

### 自定义定时任务

修改 workflow 文件中的 cron 表达式：

```yaml
schedule:
  - cron: '0 2 * * 0'  # 每周日凌晨 2 点
```

常用 cron 示例：
- `0 2 * * *` - 每天凌晨 2 点
- `0 2 * * 1` - 每周一凌晨 2 点
- `0 2 1 * *` - 每月 1 号凌晨 2 点

### 修改默认保留策略

编辑 `.github/workflows/clean-old-workflows.yml` 文件，修改默认值：

```yaml
retain_days: 30  # 改为你想要的天数
keep_minimum_runs: 5  # 改为你想要的最小保留数量
```

## 权限说明

此 workflow 需要以下权限：
- `actions: write` - 删除 workflow runs
- `contents: read` - 读取仓库内容

这些权限已在 workflow 文件中配置。

## 注意事项

⚠️ **重要提示**:
- 删除的 workflow runs **无法恢复**
- 建议首次运行时使用较大的保留天数，观察效果后再调整
- 可以先手动触发测试，确认符合预期后再依赖自动定时任务

## 故障排查

### 权限错误

如果遇到权限错误，检查：
1. 仓库 Settings → Actions → General → Workflow permissions
2. 确保选择了 "Read and write permissions"

### Token 过期

如果使用自定义 token，确保：
1. Token 未过期
2. Token 具有足够的权限（`repo` 和 `workflow`）

## 参考资料

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [delete-workflow-runs Action](https://github.com/Mattraks/delete-workflow-runs)
