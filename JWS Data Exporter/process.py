#!/usr/bin/env python
# -*- coding: utf-8 -*-
'''
@File    :   Untitled-1
@Date    :   2024/11/07 15:57:32
@Author  :   yuan 
@Desc    :   灰度图像转换
'''
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
import cv2
import numpy as np

def process_image(image_path):
    # 读取图像
    image = cv2.imread(image_path)
    if image is None:
        print("Image not found.")
        return None
    
    # 转换为灰度图并检测边缘（用于表格线检测）
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    
    # 检测直线（表格线）
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=100, minLineLength=100, maxLineGap=10)
    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            cv2.line(image, (x1, y1), (x2, y2), (0, 0, 255), 2)  # 红色表格线

    # 使用简单的图像识别规则假设标题区域位置（具体定位视实际数据调整）
    height, width = image.shape[:2]
    title_area = image[0:int(height * 0.1), :]  # 假设顶部10%为标题区域
    title_area[:] = [0, 0, 255]  # 将标题区域上色为红色

    # 模拟印章区域检测，假设印章位于右下角，大小为图像的10%
    stamp_area = image[int(height * 0.8):, int(width * 0.8):]
    overlay_stamp(stamp_area)

    # 保存处理后的图像
    processed_image_path = "processed_" + image_path
    cv2.imwrite(processed_image_path, image)
    return processed_image_path

def overlay_stamp(stamp_area):
    # 创建红色印章的半透明图像
    overlay = np.zeros(stamp_area.shape, dtype=np.uint8)
    overlay[:] = (0, 0, 255)  # 红色
    alpha = 0.5
    cv2.addWeighted(overlay, alpha, stamp_area, 1 - alpha, 0, stamp_area)

# 示例调用
image_path = "image_1.png"  # 替换为实际图片路径
output_image = process_image(image_path)
if output_image:
    print(f"处理后的图像已保存为 {output_image}")
