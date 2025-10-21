import ddddocr
import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
import io
from PIL import Image
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
    # 普通验证码 OCR 引擎
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


# ==================== API 路由 ====================
@app.route('/recognize_captcha', methods=['POST'])
def recognize_captcha():
    """
    【原始接口 - 保持向后兼容】
    识别普通验证码（接收 JSON 格式的 base64 图像）
    
    请求格式:
        POST /recognize_captcha
        Content-Type: application/json
        Body: {"image_base64": "base64编码的图像数据"}
    
    响应格式:
        成功: {"result": "识别结果"}
        失败: {"error": "错误信息"}
    """
    if ocr is None:
        return jsonify({"error": "OCR服务未初始化，请检查服务器日志。"}), 500

    try:
        data = request.get_json()
        if not data or 'image_base64' not in data:
            return jsonify({"error": "请求体中未找到 'image_base64' 字段或请求体不是有效的JSON。"}), 400

        image_base64_string = data['image_base64']

        # 移除可能的 data URI scheme 前缀 (例如 "data:image/jpeg;base64,")
        if ',' in image_base64_string:
            image_base64_string = image_base64_string.split(',', 1)[1]

        # Base64解码
        try:
            image_bytes = base64.b64decode(image_base64_string)
        except base64.binascii.Error as e:
            return jsonify({"error": f"Base64解码失败: {e}"}), 400
        except Exception as e:
            return jsonify({"error": f"Base64解码时发生未知错误: {e}"}), 400

        if not image_bytes:
            return jsonify({"error": "解码后的图像数据为空。"}), 400

        # 使用ddddocr进行识别
        result = ocr.classification(image_bytes)

        # 直接返回识别结果字符串
        return jsonify({"result": result})

    except Exception as e:
        # 记录更详细的错误信息到服务器日志
        app.logger.error(f"处理请求时发生错误: {e}", exc_info=True)
        return jsonify({"error": f"处理请求时发生内部错误: {str(e)}"}), 500


@app.route('/captcha', methods=['POST'])
def captcha():
    """
    【通用验证码识别接口】
    识别普通文字验证码（接收 multipart/form-data 格式的图像文件）
    
    这是前端浏览器脚本主要调用的接口
    
    请求格式:
        POST /captcha
        Content-Type: multipart/form-data
        Fields:
            - img: 图像文件
            - detail: JSON 字符串，包含额外信息（可选）
    
    响应格式:
        成功: {"data": {"code": "识别结果"}, "msg": "success"}
        失败: {"error": "错误信息", "msg": "fail"}
    """
    if ocr is None:
        return jsonify({
            "error": "OCR 服务未初始化",
            "msg": "OCR service not initialized"
        }), 500

    try:
        # 1. 获取上传的图像文件
        if 'img' not in request.files:
            return jsonify({
                "error": "请求中未找到 'img' 字段",
                "msg": "Missing 'img' field in request"
            }), 400
        
        img_file = request.files['img']
        if img_file.filename == '':
            return jsonify({
                "error": "未选择文件",
                "msg": "No file selected"
            }), 400
        
        # 2. 读取图像字节数据
        try:
            image_bytes = file_to_bytes(img_file)
        except ValueError as e:
            return jsonify({
                "error": str(e),
                "msg": "Failed to read file"
            }), 400
        
        # 3. 可选：验证图像有效性
        if not validate_image_bytes(image_bytes):
            return jsonify({
                "error": "上传的文件不是有效的图像",
                "msg": "Invalid image file"
            }), 400
        
        # 4. 使用 OCR 引擎识别验证码
        result = ocr.classification(image_bytes)
        
        # 5. 获取额外的详情信息（可选）
        detail_str = request.form.get('detail', '{}')
        try:
            import json
            detail = json.loads(detail_str)
            href = detail.get('href', '')
            app.logger.info(f"识别成功 - 来源: {href}, 结果: {result}")
        except:
            pass
        
        # 6. 返回识别结果（前端期望的格式）
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
    # 确保在开发环境中运行，生产环境请使用 Gunicorn 或 uWSGI 等WSGI服务器
    # 例如: flask run --host=0.0.0.0 --port=5000
    # 或者在代码中指定:
    app.run(host='0.0.0.0', port=9876, debug=True)
    # 注意：debug=True 不应在生产环境中使用