# 图标文件说明

## 需要的图标文件

此Chrome扩展需要以下三个图标文件：

1. `icon16.png` - 16x16 像素（工具栏小图标）
2. `icon48.png` - 48x48 像素（扩展管理页面）
3. `icon128.png` - 128x128 像素（Chrome Web Store）

## 快速生成图标的方法

### 方法1：使用在线工具

推荐以下在线图标生成器：
- [Favicon Generator](https://favicon.io/)
- [IconKitchen](https://icon.kitchen/)
- [RealFaviconGenerator](https://realfavicongenerator.net/)

### 方法2：使用图标库

从以下网站下载免费图标：
- [Flaticon](https://www.flaticon.com/)
- [Icons8](https://icons8.com/)
- [Iconfinder](https://www.iconfinder.com/)

搜索关键词：education, learning, speed, video, play

### 方法3：使用 Python 脚本生成简单图标

如果你已安装 Python 和 Pillow 库，可以运行 `generate_icons.py`：

```bash
python generate_icons.py
```

### 方法4：从文字生成

使用在线工具将文字转为图标：
1. 访问 [Text to Image](https://texttoimage.com/)
2. 输入"21"或"TB"
3. 选择合适的字体和颜色
4. 导出为 PNG 格式
5. 调整尺寸为 16x16, 48x48, 128x128

## 临时解决方案

如果暂时没有图标，可以：
1. 复制任何其他 Chrome 扩展的图标
2. 使用纯色正方形图片
3. 先加载扩展，图标可以后续替换

扩展功能不受图标文件影响，只是视觉效果会受影响。

