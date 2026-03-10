#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 Chrome 扩展图标
"""

import sys
import io
from PIL import Image, ImageDraw, ImageFont
import os

# 设置标准输出编码为 UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def create_icon(size, filename):
    """创建一个简单的图标"""
    # 创建图片，使用蓝色背景
    img = Image.new('RGB', (size, size), color='#0066FF')
    draw = ImageDraw.Draw(img)

    # 计算文字大小
    font_size = int(size * 0.5)

    try:
        # 尝试使用系统字体
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", font_size)
        except:
            # 如果找不到字体，使用默认字体
            font = ImageFont.load_default()

    # 绘制文字 "MD"
    text = "MD"

    # 获取文字边界框
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    # 计算居中位置
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - bbox[1]

    # 绘制白色文字
    draw.text((x, y), text, fill='white', font=font)

    # 保存图片
    img.save(filename, 'PNG')
    print(f"[OK] 已生成: {filename} ({size}x{size})")

def main():
    # 确保 icons 目录存在
    icons_dir = os.path.join(os.path.dirname(__file__), 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    # 生成三个尺寸的图标
    sizes = [
        (16, 'icon16.png'),
        (48, 'icon48.png'),
        (128, 'icon128.png')
    ]

    print("开始生成图标...")
    for size, filename in sizes:
        filepath = os.path.join(icons_dir, filename)
        create_icon(size, filepath)

    print("\n图标生成完成！")

if __name__ == '__main__':
    main()
