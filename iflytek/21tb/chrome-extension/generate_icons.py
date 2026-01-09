#!/usr/bin/env python3
"""
简单的图标生成脚本
生成 16x16, 48x48, 128x128 的占位图标
"""

try:
    from PIL import Image, ImageDraw, ImageFont
    import os
    
    def generate_icon(size, filename):
        """生成指定尺寸的图标"""
        # 创建渐变背景
        img = Image.new('RGB', (size, size), color='white')
        draw = ImageDraw.Draw(img)
        
        # 绘制渐变背景（从蓝色到紫色）
        for i in range(size):
            r = int(102 + (118 - 102) * i / size)
            g = int(126 + (75 - 126) * i / size)
            b = int(234 + (162 - 234) * i / size)
            draw.line([(0, i), (size, i)], fill=(r, g, b))
        
        # 绘制文字 "21"
        try:
            # 尝试使用系统字体
            font_size = int(size * 0.5)
            try:
                # Windows
                font = ImageFont.truetype("arial.ttf", font_size)
            except:
                try:
                    # macOS
                    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
                except:
                    try:
                        # Linux
                        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
                    except:
                        # 使用默认字体
                        font = ImageFont.load_default()
        except:
            font = ImageFont.load_default()
        
        text = "21"
        # 获取文字边界框
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        # 居中绘制文字
        x = (size - text_width) // 2
        y = (size - text_height) // 2
        
        # 绘制白色文字（带阴影效果）
        draw.text((x+2, y+2), text, fill=(0, 0, 0, 128), font=font)  # 阴影
        draw.text((x, y), text, fill='white', font=font)  # 文字
        
        # 保存图标
        img.save(filename, 'PNG')
        print(f"✓ 已生成: {filename} ({size}x{size})")
    
    # 生成三个尺寸的图标
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    print("开始生成图标...")
    generate_icon(16, os.path.join(script_dir, 'icon16.png'))
    generate_icon(48, os.path.join(script_dir, 'icon48.png'))
    generate_icon(128, os.path.join(script_dir, 'icon128.png'))
    print("\n✓ 所有图标生成完成！")
    print("\n现在可以在 Chrome 浏览器中加载此扩展了。")
    
except ImportError:
    print("错误：未找到 Pillow 库")
    print("\n请先安装 Pillow 库：")
    print("  pip install Pillow")
    print("\n或者：")
    print("  pip3 install Pillow")
    print("\n安装完成后重新运行此脚本。")
    print("\n如果不想安装 Pillow，请参考 ICONS_README.md 使用其他方法生成图标。")

