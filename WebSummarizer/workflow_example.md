# Dify工作流配置示例

## 工作流输入参数

在Dify中创建工作流时，需要定义以下输入参数：

### 参数1: newsUrl

- **类型**: String (文本)
- **描述**: 当前网页的URL地址
- **必填**: 是
- **用途**: 提供给大模型作为参考，方便在总结中引用原文链接

### 参数2: newsContent

- **类型**: String (文本)
- **描述**: 网页的正文内容
- **必填**: 是
- **用途**: 需要总结的主要文本内容

## 工作流示例结构

### 简单版本

```
开始
  ↓
[输入节点]
  - newsUrl
  - newsContent
  ↓
[LLM节点]
  系统提示词：
    你是一个专业的内容总结助手。请对用户提供的网页内容进行总结。
    要求：
    1. 提取3-5个关键要点
    2. 用简洁的语言概括主要内容
    3. 如果有重要观点或结论，请特别标注
    4. 保持客观中立
    
  用户提示词：
    请总结以下网页内容：
    
    网页地址：{{newsUrl}}
    
    正文内容：
    {{newsContent}}
  ↓
[输出节点]
  - text: {{LLM输出}}
  ↓
结束
```

### 高级版本（包含结构化输出）

```
开始
  ↓
[输入节点]
  - newsUrl
  - newsContent
  ↓
[LLM节点1: 内容分析]
  提示词：
    分析以下内容的类型（技术文章/新闻/博客/教程等）和主题
    
    内容：{{newsContent}}
  ↓
[LLM节点2: 智能总结]
  提示词：
    根据内容类型 {{LLM节点1输出}}，对以下内容进行针对性总结：
    
    对于技术文章：提取技术要点、实现方法、适用场景
    对于新闻：提取5W1H（何时、何地、何人、何事、为何、如何）
    对于教程：提取学习目标、关键步骤、注意事项
    对于博客：提取核心观点、论据、结论
    
    网页地址：{{newsUrl}}
    内容：{{newsContent}}
  ↓
[代码节点: 格式化输出]（可选）
  使用Python/JavaScript格式化输出结果
  ↓
[输出节点]
  - text: {{格式化后的总结}}
  ↓
结束
```

## LLM提示词模板推荐

### 模板1: 通用总结

```
你是一个专业的内容总结专家。请对以下网页内容进行全面总结。

网页地址：{{newsUrl}}

请按照以下格式输出：

## 📌 核心要点
- 要点1
- 要点2
- 要点3

## 📝 内容概述
（用2-3段话概括主要内容）

## 💡 关键信息
- 重要观点或数据
- 值得关注的细节

## 🔗 原文链接
{{newsUrl}}

---

正文内容：
{{newsContent}}
```

### 模板2: 技术文章专用

```
作为技术文档分析专家，请总结这篇技术文章。

## 📊 文章信息
- 原文：{{newsUrl}}

请提取以下信息：

### 🎯 技术主题

### 🔧 核心技术/方法

### 💻 关键代码/配置
（如有）

### ⚠️ 注意事项

### 🚀 适用场景

### 📚 相关技术

---

文章内容：
{{newsContent}}
```

### 模板3: 新闻总结

```
请用新闻摘要的方式总结以下内容：

## 📰 新闻速览

**时间**: （从内容中提取）
**地点**: （从内容中提取）
**人物**: （从内容中提取）
**事件**: （简要描述）
**原因**: （背景和原因）
**影响**: （可能的影响）

## 🔍 详细内容
（3-5个要点）

## 🔗 来源
{{newsUrl}}

---

原文：
{{newsContent}}
```

## 输出格式配置

### 方法1: 直接输出（推荐用于简单场景）

在输出节点中直接使用LLM的返回结果：

```json
{
  "text": "{{LLM节点.output}}"
}
```

### 方法2: 结构化输出

使用代码节点处理后输出：

```python
def main(llm_output: str, news_url: str) -> dict:
    """
    格式化输出结果
    """
    result = f"""
# 网页内容总结

{llm_output}

---
*由 AI 自动生成 | 原文: {news_url}*
    """
    
    return {
        "text": result.strip()
    }
```

### 方法3: Markdown增强

```python
def main(llm_output: str, news_url: str, news_content: str) -> dict:
    """
    生成增强版Markdown总结
    """
    word_count = len(news_content)
    
    result = f"""
# 📄 智能总结

{llm_output}

---

## 📊 统计信息
- **原文字数**: {word_count:,} 字
- **原文链接**: [{news_url}]({news_url})
- **生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

---
*Powered by Dify AI*
    """
    
    return {
        "text": result.strip(),
        "word_count": word_count
    }
```

## API响应示例

脚本期望的Dify API响应格式：

### 格式1: 标准工作流响应

```json
{
  "data": {
    "outputs": {
      "text": "这是总结的内容..."
    }
  }
}
```

### 格式2: 带结果字段

```json
{
  "data": {
    "outputs": {
      "result": "这是总结的内容..."
    }
  }
}
```

### 格式3: 直接answer字段

```json
{
  "answer": "这是总结的内容..."
}
```

## 调试技巧

### 1. 测试工作流

在Dify平台上先手动测试工作流：

**测试输入**:

```json
{
  "newsUrl": "https://example.com/article",
  "newsContent": "这是一篇测试文章的内容..."
}

```

**检查输出**:

- 确认返回格式正确
- 验证总结质量
- 记录响应路径

### 2. 查看控制台日志

在浏览器中按F12打开开发者工具，脚本会输出：

- 提取的内容长度
- 内容预览（前500字符）
- API请求和响应信息
- 错误详情

### 3. 修改响应解析路径

如果你的Dify返回格式不同，修改脚本中的这段代码：

```javascript
// 在 DifyAPI.summarize 方法中
const result = data.data?.outputs?.text ||      // 路径1
               data.data?.outputs?.result ||    // 路径2  
               data.answer ||                    // 路径3
               data.outputs?.text ||             // 路径4（添加）
               JSON.stringify(data, null, 2);   // 降级：显示完整JSON
```

## 性能优化建议

### 1. 内容长度限制

对于超长文章，可以在发送前截取：

```javascript
// 在脚本中添加内容截取
const maxLength = 10000; // 最多10000字符
const truncatedContent = newsContent.length > maxLength 
    ? newsContent.substring(0, maxLength) + '\n\n...(内容已截断)'
    : newsContent;
```

### 2. 缓存结果

在Dify工作流中添加缓存逻辑，避免重复处理相同内容。

### 3. 使用流式输出（高级）

如果Dify支持，可以修改脚本使用 `response_mode: 'streaming'` 实现实时显示。

## 常见问题

### Q: 如何在总结中保留原文格式？

A: 在LLM提示词中要求保留格式，或使用代码节点处理Markdown。

### Q: 如何处理多语言内容？

A: 在提示词中添加语言检测和翻译需求。

### Q: 如何自定义总结长度？

A: 在提示词中明确指定字数限制，例如"请用200字以内总结"。

### Q: 如何提高总结质量？

A:

1. 优化提示词，提供更具体的要求
2. 使用更强大的模型（如GPT-4）
3. 添加few-shot示例
4. 针对不同类型内容使用不同模板

---

**祝你配置顺利！** 🎉
