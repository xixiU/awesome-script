"""
图像预处理模块
从 captcha/backend/recognize_captcha.py 迁移的多策略预处理逻辑
"""
from PIL import Image, ImageEnhance, ImageOps, ImageFilter
import io


def composite_white_bg(img):
    """将带透明通道的图像合成到白色背景"""
    if img.mode == 'RGBA':
        background = Image.new("RGBA", img.size, (255, 255, 255, 255))
        background.paste(img, mask=img.split()[3])
        return background.convert("RGB")
    return img.convert("RGB")


def scale_up(img):
    """放大小图，提升 OCR 精度"""
    w, h = img.size
    if w < 100:
        scale = 3
    elif w < 200:
        scale = 2
    else:
        scale = 1
    if scale > 1:
        img = img.resize((w * scale, h * scale), Image.LANCZOS)
    return img


def binarize(img_gray, threshold=180):
    """固定阈值二值化，返回黑字白底图"""
    return img_gray.point(lambda p: 0 if p < threshold else 255, 'L')


def morphological_open(img_binary, kernel_size=3):
    """
    形态学开运算（腐蚀→膨胀），去除细干扰线。
    对黑字白底图：先 MaxFilter（腐蚀黑色特征），再 MinFilter（膨胀黑色特征）。
    细于 kernel_size 的特征（干扰线）被腐蚀掉后无法恢复，而粗字符笔画可以恢复。
    """
    img = img_binary.filter(ImageFilter.MaxFilter(kernel_size))  # 腐蚀黑色
    img = img.filter(ImageFilter.MinFilter(kernel_size))          # 膨胀黑色
    return img


def otsu_threshold(img_gray):
    """Otsu 自适应阈值：统计灰度直方图，找最大类间方差的最优分割点"""
    hist = img_gray.histogram()
    total = sum(hist)
    sum_b, w_b, max_var, threshold = 0, 0, 0, 128
    sum_all = sum(i * hist[i] for i in range(256))
    for i in range(256):
        w_b += hist[i]
        if w_b == 0:
            continue
        w_f = total - w_b
        if w_f == 0:
            break
        sum_b += i * hist[i]
        m_b = sum_b / w_b
        m_f = (sum_all - sum_b) / w_f
        var = w_b * w_f * (m_b - m_f) ** 2
        if var > max_var:
            max_var = var
            threshold = i
    return threshold


def get_candidates(image_bytes):
    """
    专业多策略预处理候选图像生成器。
    覆盖场景：干扰线、彩色背景噪声、细体字、扭曲字符、彩色文字等。
    返回：list[bytes]，每项为 PNG 字节数据
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    img = composite_white_bg(img)
    img = scale_up(img)
    gray = img.convert("L")

    # 彩色通道分离（针对彩色噪点背景，文字可能在某个颜色通道更清晰）
    r_ch, g_ch, b_ch = img.split()

    pil_candidates = []

    # ── 策略组 A：灰度 + 自适应 Otsu 阈值（适应各种亮度分布）──
    # A1: AutoContrast 归一化 + Otsu 二值化 + 形态学去干扰线
    ac = ImageOps.autocontrast(gray, cutoff=2)
    t_otsu = otsu_threshold(ac)
    b_a1 = binarize(ac, threshold=t_otsu)
    pil_candidates.append(morphological_open(b_a1, kernel_size=3))

    # A2: AutoContrast + Otsu + 更大核形态学（去粗干扰线）
    pil_candidates.append(morphological_open(b_a1, kernel_size=5))

    # ── 策略组 B：固定阈值覆盖不同灰度区间 ──
    # B1: 轻微对比度增强 + 低阈值（保留细笔画，避免 r/p 混淆）
    g_b1 = ImageEnhance.Contrast(gray).enhance(1.5)
    pil_candidates.append(binarize(g_b1, threshold=140))

    # B2: 中等对比度 + 中阈值 + 形态学
    g_b2 = ImageEnhance.Contrast(gray).enhance(2.0)
    b_b2 = binarize(g_b2, threshold=180)
    pil_candidates.append(morphological_open(b_b2, kernel_size=3))

    # B3: 强对比度 + 高阈值（白背景黑字，消除浅色噪点）
    g_b3 = ImageEnhance.Contrast(gray).enhance(2.5)
    pil_candidates.append(binarize(g_b3, threshold=210))

    # ── 策略组 C：高斯去噪预处理（针对椒盐噪点/密集干扰点）──
    # C1: 高斯模糊去噪 → 对比度增强 → Otsu 二值化
    blurred = gray.filter(ImageFilter.GaussianBlur(radius=1))
    g_c1 = ImageEnhance.Contrast(blurred).enhance(2.0)
    t_c1 = otsu_threshold(g_c1)
    pil_candidates.append(binarize(g_c1, threshold=t_c1))

    # C2: 高斯模糊 → 强对比 → 形态学去干扰线
    blurred2 = gray.filter(ImageFilter.GaussianBlur(radius=0.8))
    g_c2 = ImageEnhance.Contrast(blurred2).enhance(2.5)
    b_c2 = binarize(g_c2, threshold=170)
    pil_candidates.append(morphological_open(b_c2, kernel_size=3))

    # ── 策略组 D：锐化增强（针对模糊验证码）──
    # D1: UnsharpMask 锐化 + AutoContrast + 二值化
    sharp = gray.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
    ac_d1 = ImageOps.autocontrast(sharp, cutoff=1)
    t_d1 = otsu_threshold(ac_d1)
    pil_candidates.append(binarize(ac_d1, threshold=t_d1))

    # D2: 多次锐化 + 中等阈值（增强笔画边缘）
    sharp2 = gray.filter(ImageFilter.SHARPEN).filter(ImageFilter.SHARPEN)
    g_d2 = ImageEnhance.Contrast(sharp2).enhance(1.8)
    pil_candidates.append(binarize(g_d2, threshold=160))

    # ── 策略组 E：彩色通道分离（针对彩色验证码）──
    # E1: 取最暗通道（文字通常是深色，取 R/G/B 最小值近似）
    def _min_channel(r, g, b):
        pixels_r = list(r.getdata())
        pixels_g = list(g.getdata())
        pixels_b = list(b.getdata())
        min_ch = Image.new('L', r.size)
        min_ch.putdata([min(pr, pg, pb) for pr, pg, pb in zip(pixels_r, pixels_g, pixels_b)])
        return min_ch
    dark_ch = _min_channel(r_ch, g_ch, b_ch)
    g_e1 = ImageEnhance.Contrast(dark_ch).enhance(2.0)
    t_e1 = otsu_threshold(g_e1)
    pil_candidates.append(binarize(g_e1, threshold=t_e1))

    # E2: 绿色通道（文字多为非绿色，绿通道背景白，文字暗）
    g_e2 = ImageEnhance.Contrast(g_ch).enhance(2.0)
    pil_candidates.append(binarize(g_e2, threshold=otsu_threshold(g_e2)))

    # ── 策略 F：原始灰度保底（不二值化，保留灰度层次）──
    g_f = ImageEnhance.Contrast(gray).enhance(1.8)
    pil_candidates.append(g_f.filter(ImageFilter.UnsharpMask(radius=1, percent=100, threshold=2)))

    result = []
    for candidate in pil_candidates:
        buf = io.BytesIO()
        candidate.save(buf, format="PNG")
        result.append(buf.getvalue())
    return result
