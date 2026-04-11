import ddddocr
import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
import io
from PIL import Image, ImageEnhance, ImageOps, ImageFilter
import traceback

# ==================== 第一性原理：验证码识别的本质 ====================
# 验证码识别从根本上是图像到文本的映射问题
# 1. 输入：图像数据（不同格式：base64, 文件流, URL等）
# 2. 处理：使用 OCR 模型进行识别或目标检测
# 3. 输出：识别结果（文本、坐标、置信度等）
# ====================================================================

# ==================== 初始化 OCR 引擎 ====================
# ddddocr 提供多种模式：
# 1. 普通 OCR：识别数字、字母、汉字验证码
# 2. 目标检测：识别滑动验证码的缺口位置
# 3. 点选验证码：识别需要点击的目标位置
try:
    # 优先尝试 beta 模型（更新、对英文字母识别更准确）
    ocr = ddddocr.DdddOcr(beta=True, show_ad=False)
    print("✓ 普通验证码 OCR 引擎初始化成功 (beta 模型)")
except Exception:
    try:
        ocr = ddddocr.DdddOcr(show_ad=False)
        print("✓ 普通验证码 OCR 引擎初始化成功")
    except Exception as e:
        print(f"✗ 初始化普通 OCR 引擎失败: {e}")
        print("请确保已正确安装 ddddocr: pip install ddddocr")
        ocr = None

try:
    # 滑动验证码检测引擎（用于检测缺口位置）
    det_ocr = ddddocr.DdddOcr(det=False, ocr=False, show_ad=False)
    print("✓ 滑动验证码检测引擎初始化成功")
except Exception as e:
    print(f"✗ 初始化滑动验证码检测引擎失败: {e}")
    det_ocr = None

app = Flask(__name__)
CORS(app)  # 允许跨域请求，因为前端脚本可能来自不同域名


# ==================== 辅助函数 ====================

def parse_base64_image(image_base64_string):
    """
    解析 base64 编码的图像数据
    
    参数:
        image_base64_string: base64 编码的图像字符串（可能带有 data URI scheme 前缀）
    返回:
        bytes: 解码后的图像字节数据
    异常:
        ValueError: 当 base64 解码失败时
    """
    # 移除可能的 data URI scheme 前缀 (例如 "data:image/jpeg;base64,")
    if ',' in image_base64_string:
        image_base64_string = image_base64_string.split(',', 1)[1]
    
    try:
        image_bytes = base64.b64decode(image_base64_string)
        if not image_bytes:
            raise ValueError("解码后的图像数据为空")
        return image_bytes
    except base64.binascii.Error as e:
        raise ValueError(f"Base64 解码失败: {e}")
    except Exception as e:
        raise ValueError(f"Base64 解码时发生未知错误: {e}")


def file_to_bytes(file_storage):
    """
    从 Flask FileStorage 对象中读取图像字节数据
    参数:
        file_storage: Flask 的 FileStorage 对象
    返回:
        bytes: 图像字节数据
    """
    try:
        file_storage.seek(0)  # 确保从文件开头读取
        image_bytes = file_storage.read()
        if not image_bytes:
            raise ValueError("文件内容为空")
        return image_bytes
    except Exception as e:
        raise ValueError(f"读取文件失败: {e}")


def validate_image_bytes(image_bytes):
    """
    验证图像字节数据是否有效
    参数:
        image_bytes: 图像字节数据
    返回:
        bool: 是否为有效图像
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.verify()  # 验证图像完整性
        return True
    except Exception:
        return False


def _composite_white_bg(img):
    """将带透明通道的图像合成到白色背景"""
    if img.mode == 'RGBA':
        background = Image.new("RGBA", img.size, (255, 255, 255, 255))
        background.paste(img, mask=img.split()[3])
        return background.convert("RGB")
    return img.convert("RGB")


def _scale_up(img):
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


def _binarize(img_gray, threshold=180):
    """固定阈值二值化，返回黑字白底图"""
    return img_gray.point(lambda p: 0 if p < threshold else 255, 'L')


def _morphological_open(img_binary, kernel_size=3):
    """
    形态学开运算（腐蚀→膨胀），去除细干扰线。
    对黑字白底图：先 MaxFilter（腐蚀黑色特征），再 MinFilter（膨胀黑色特征）。
    细于 kernel_size 的特征（干扰线）被腐蚀掉后无法恢复，而粗字符笔画可以恢复。
    """
    img = img_binary.filter(ImageFilter.MaxFilter(kernel_size))  # 腐蚀黑色
    img = img.filter(ImageFilter.MinFilter(kernel_size))          # 膨胀黑色
    return img


def _otsu_threshold(img_gray):
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


def _get_candidates(image_bytes):
    """
    专业多策略预处理候选图像生成器。
    覆盖场景：干扰线、彩色背景噪声、细体字、扭曲字符、彩色文字等。
    返回：list[bytes]，每项为 PNG 字节数据
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    img = _composite_white_bg(img)
    img = _scale_up(img)
    gray = img.convert("L")

    # 彩色通道分离（针对彩色噪点背景，文字可能在某个颜色通道更清晰）
    r_ch, g_ch, b_ch = img.split()

    pil_candidates = []

    # ── 策略组 A：灰度 + 自适应 Otsu 阈值（适应各种亮度分布）──
    # A1: AutoContrast 归一化 + Otsu 二值化 + 形态学去干扰线
    ac = ImageOps.autocontrast(gray, cutoff=2)
    t_otsu = _otsu_threshold(ac)
    b_a1 = _binarize(ac, threshold=t_otsu)
    pil_candidates.append(_morphological_open(b_a1, kernel_size=3))

    # A2: AutoContrast + Otsu + 更大核形态学（去粗干扰线）
    pil_candidates.append(_morphological_open(b_a1, kernel_size=5))

    # ── 策略组 B：固定阈值覆盖不同灰度区间 ──
    # B1: 轻微对比度增强 + 低阈值（保留细笔画，避免 r/p 混淆）
    g_b1 = ImageEnhance.Contrast(gray).enhance(1.5)
    pil_candidates.append(_binarize(g_b1, threshold=140))

    # B2: 中等对比度 + 中阈值 + 形态学
    g_b2 = ImageEnhance.Contrast(gray).enhance(2.0)
    b_b2 = _binarize(g_b2, threshold=180)
    pil_candidates.append(_morphological_open(b_b2, kernel_size=3))

    # B3: 强对比度 + 高阈值（白背景黑字，消除浅色噪点）
    g_b3 = ImageEnhance.Contrast(gray).enhance(2.5)
    pil_candidates.append(_binarize(g_b3, threshold=210))

    # ── 策略组 C：高斯去噪预处理（针对椒盐噪点/密集干扰点）──
    # C1: 高斯模糊去噪 → 对比度增强 → Otsu 二值化
    blurred = gray.filter(ImageFilter.GaussianBlur(radius=1))
    g_c1 = ImageEnhance.Contrast(blurred).enhance(2.0)
    t_c1 = _otsu_threshold(g_c1)
    pil_candidates.append(_binarize(g_c1, threshold=t_c1))

    # C2: 高斯模糊 → 强对比 → 形态学去干扰线
    blurred2 = gray.filter(ImageFilter.GaussianBlur(radius=0.8))
    g_c2 = ImageEnhance.Contrast(blurred2).enhance(2.5)
    b_c2 = _binarize(g_c2, threshold=170)
    pil_candidates.append(_morphological_open(b_c2, kernel_size=3))

    # ── 策略组 D：锐化增强（针对模糊验证码）──
    # D1: UnsharpMask 锐化 + AutoContrast + 二值化
    sharp = gray.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
    ac_d1 = ImageOps.autocontrast(sharp, cutoff=1)
    t_d1 = _otsu_threshold(ac_d1)
    pil_candidates.append(_binarize(ac_d1, threshold=t_d1))

    # D2: 多次锐化 + 中等阈值（增强笔画边缘）
    sharp2 = gray.filter(ImageFilter.SHARPEN).filter(ImageFilter.SHARPEN)
    g_d2 = ImageEnhance.Contrast(sharp2).enhance(1.8)
    pil_candidates.append(_binarize(g_d2, threshold=160))

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
    t_e1 = _otsu_threshold(g_e1)
    pil_candidates.append(_binarize(g_e1, threshold=t_e1))

    # E2: 绿色通道（文字多为非绿色，绿通道背景白，文字暗）
    g_e2 = ImageEnhance.Contrast(g_ch).enhance(2.0)
    pil_candidates.append(_binarize(g_e2, threshold=_otsu_threshold(g_e2)))

    # ── 策略 F：原始灰度保底（不二值化，保留灰度层次）──
    g_f = ImageEnhance.Contrast(gray).enhance(1.8)
    pil_candidates.append(g_f.filter(ImageFilter.UnsharpMask(radius=1, percent=100, threshold=2)))

    result = []
    for candidate in pil_candidates:
        buf = io.BytesIO()
        candidate.save(buf, format="PNG")
        result.append(buf.getvalue())
    return result


# ==================== 核心识别函数 ====================

def do_recognize(image_bytes):
    """
    核心识别逻辑：多策略预处理 + 投票 OCR，供各接口复用。
    返回识别结果字符串，失败时抛出异常。
    """
    from collections import Counter
    try:
        candidates = _get_candidates(image_bytes)
    except Exception as e:
        app.logger.warning(f"图像预处理失败，使用原始图像: {e}")
        return ocr.classification(image_bytes)

    results = []
    for candidate_bytes in candidates:
        try:
            text = ocr.classification(candidate_bytes)
            if text:
                results.append(text)
        except Exception:
            pass

    if not results:
        # 所有策略均失败，回退到原始图像
        return ocr.classification(image_bytes)

    # 投票：选出现次数最多的结果；平局时取第一个策略的结果
    vote_counter = Counter(results)
    return vote_counter.most_common(1)[0][0]


# ==================== API 路由 ====================

@app.route('/recognize_captcha', methods=['POST'])
def recognize_captcha():
    """
    识别普通验证码（JSON 格式，供 enetedu.js 调用）

    请求: POST /recognize_captcha  Content-Type: application/json
          {"image_base64": "base64编码的图像数据"}
    响应: {"result": "识别结果"} 或 {"error": "错误信息"}
    """
    if ocr is None:
        return jsonify({"error": "OCR服务未初始化，请检查服务器日志。"}), 500

    try:
        data = request.get_json()
        if not data or 'image_base64' not in data:
            return jsonify({"error": "请求体中未找到 'image_base64' 字段或请求体不是有效的JSON。"}), 400

        image_bytes = parse_base64_image(data['image_base64'])
        if not image_bytes:
            return jsonify({"error": "解码后的图像数据为空。"}), 400

        result = do_recognize(image_bytes)
        return jsonify({"result": result})

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        app.logger.error(f"处理请求时发生错误: {e}", exc_info=True)
        return jsonify({"error": f"处理请求时发生内部错误: {str(e)}"}), 500


@app.route('/captcha', methods=['POST'])
def captcha():
    """
    识别普通验证码（multipart/form-data 格式，供 browser_capture.js 调用）

    请求: POST /captcha  Content-Type: multipart/form-data
          img: 图像文件  detail: JSON 字符串（可选，含来源 href）
    响应: {"data": {"code": "识别结果"}, "msg": "success"}
          {"error": "错误信息", "msg": "fail"}
    """
    if ocr is None:
        return jsonify({"error": "OCR 服务未初始化", "msg": "OCR service not initialized"}), 500

    try:
        if 'img' not in request.files:
            return jsonify({"error": "请求中未找到 'img' 字段", "msg": "Missing 'img' field in request"}), 400

        img_file = request.files['img']
        if img_file.filename == '':
            return jsonify({"error": "未选择文件", "msg": "No file selected"}), 400

        try:
            image_bytes = file_to_bytes(img_file)
        except ValueError as e:
            return jsonify({"error": str(e), "msg": "Failed to read file"}), 400

        if not validate_image_bytes(image_bytes):
            return jsonify({"error": "上传的文件不是有效的图像", "msg": "Invalid image file"}), 400

        result = do_recognize(image_bytes)

        # 记录来源（可选）
        detail_str = request.form.get('detail', '{}')

        try:
            import json
            href = json.loads(detail_str).get('href', '')
            app.logger.info(f"识别成功 - 来源: {href}, 结果: {result}")
        except Exception:
            pass

        return jsonify({
            "data": {
                "code": result.strip() if result else ""
            },
            "msg": "success"
        }), 200

    except Exception as e:
        # 记录详细的错误信息
        app.logger.error(f"验证码识别失败: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            "error": f"识别失败: {str(e)}",
            "msg": "Recognition failed"
        }), 500


@app.route('/slideCaptcha', methods=['POST'])
def slide_captcha():
    """
    【滑动验证码识别接口】
    识别滑动验证码的缺口位置
    
    原理：使用图像匹配算法找到小图在大图中的位置
    
    请求格式:
        POST /slideCaptcha
        Content-Type: multipart/form-data
        Fields:
            - target_img: 目标小图（缺口图片）
            - bg_img: 背景大图
            - targetWidth: 目标图片的显示宽度（像素）
            - bgWidth: 背景图片的显示宽度（像素）
            - detail: JSON 字符串，包含额外信息（可选）
    
    响应格式:
        成功: {"result": {"target": [x坐标, y坐标, 宽度, 高度]}, "msg": "success"}
        失败: {"error": "错误信息", "msg": "fail"}
    """
    if det_ocr is None:
        return jsonify({
            "error": "滑动验证码检测服务未初始化",
            "msg": "Slide captcha detection service not initialized"
        }), 500

    try:
        # 1. 获取上传的图像文件
        if 'target_img' not in request.files or 'bg_img' not in request.files:
            return jsonify({
                "error": "请求中未找到 'target_img' 或 'bg_img' 字段",
                "msg": "Missing required image fields"
            }), 400
        
        target_file = request.files['target_img']
        bg_file = request.files['bg_img']
        
        # 2. 读取图像字节数据
        try:
            target_bytes = file_to_bytes(target_file)
            bg_bytes = file_to_bytes(bg_file)
        except ValueError as e:
            return jsonify({
                "error": str(e),
                "msg": "Failed to read files"
            }), 400
        
        # 3. 获取图片尺寸信息（用于坐标换算）
        try:
            target_width = int(request.form.get('targetWidth', 0))
            bg_width = int(request.form.get('bgWidth', 0))
        except:
            target_width = 0
            bg_width = 0
        
        # 4. 使用 ddddocr 的滑动验证码检测功能
        # 注意：这个方法会返回缺口在背景图中的位置
        result = det_ocr.slide_match(target_bytes, bg_bytes, simple_target=True)
        
        # 5. 处理结果
        # result 是一个字典，包含 'target' 键，值为 [x, y, width, height]
        if result and 'target' in result:
            x_coordinate = result['target'][0]
            
            # 如果提供了实际显示尺寸，需要按比例缩放坐标
            # 因为图片的原始尺寸可能与浏览器中显示的尺寸不同
            if bg_width > 0:
                # 获取原始图片宽度
                bg_img = Image.open(io.BytesIO(bg_bytes))
                original_width = bg_img.width
                
                # 计算缩放比例并调整坐标
                if original_width > 0:
                    scale = bg_width / original_width
                    x_coordinate = int(x_coordinate * scale)
                    result['target'][0] = x_coordinate
            
            app.logger.info(f"滑动验证码识别成功 - 缺口位置: {result['target']}")
            
            return jsonify({
                "result": result,
                "msg": "success"
            }), 200
        else:
            return jsonify({
                "error": "未能检测到缺口位置",
                "msg": "Failed to detect gap position"
            }), 500

    except Exception as e:
        # 记录详细的错误信息
        app.logger.error(f"滑动验证码识别失败: {e}")
        app.logger.error(traceback.format_exc())
        return jsonify({
            "error": f"识别失败: {str(e)}",
            "msg": "Recognition failed"
        }), 500


@app.route('/health', methods=['GET'])
def health_check():
    """
    【健康检查接口】
    检查服务状态和各个引擎的可用性
    """
    status = {
        "service": "running",
        "ocr_available": ocr is not None,
        "slide_detection_available": det_ocr is not None,
        "timestamp": import_time()
    }
    
    return jsonify(status), 200


def import_time():
    """获取当前时间戳"""
    from datetime import datetime
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        # 测试模式：python recognize_captcha.py <图片路径>
        file_path = sys.argv[1]
        with open(file_path, 'rb') as f:
            image_bytes = f.read()
        result = do_recognize(image_bytes)
        print(f"识别结果: {result}")
    else:
        app.run(host='0.0.0.0', port=9876, debug=True)