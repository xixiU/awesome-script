// ==UserScript==
// @name         智慧法庭强制分页
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  通过修改 React 内部属性 (Props)，强制为 Ant Design 分页器添加 100/200 条选项
// @author       SecurityDev
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 调试日志
    const LOG_PREFIX = '[AntD-Force] ';

    /**
     * 核心函数：获取 DOM 元素对应的 React Fiber 实例
     * React 16+ 将实例挂载在 DOM 节点的属性上，通常以 __reactInternalInstance$ 开头
     */
    function getFiber(dom) {
        const key = Object.keys(dom).find(k => k.startsWith('__reactInternalInstance$') || k.startsWith('__reactFiber$'));
        return key ? dom[key] : null;
    }

    /**
     * 核心逻辑：遍历并修改
     */
    function hijackPageSizeOptions() {
        // 1. 找到所有的“页数选择器”容器
        // 根据提供的HTML，这是那个一直显示 "10 条/页" 的框
        const targets = document.querySelectorAll('.ant-pagination-options-size-changer');

        targets.forEach(target => {
            // 如果已经处理过，跳过
            if (target.dataset.antHacked === 'true') return;

            // 2. 获取 Fiber
            let fiber = getFiber(target);
            if (!fiber) return;

            // 3. 向上遍历 Fiber 树，寻找持有 pageSizeOptions 的组件
            // 通常结构是: Select -> Pagination -> ...
            // 我们需要找到 props 中包含 pageSizeOptions 的那一层
            let found = false;
            let currentFiber = fiber;
            let depth = 0;

            while (currentFiber && depth < 10) {
                const props = currentFiber.memoizedProps || currentFiber.props;

                // 检查 props 是否包含 pageSizeOptions
                if (props && Array.isArray(props.pageSizeOptions)) {

                    // 4. 直接修改内存中的 Props 数据
                    // 注意：这里我们修改的是引用，React 下次渲染（点击下拉时）会读取这个新数组
                    const originalOptions = props.pageSizeOptions;

                    // 检查是否已经包含我们需要的大数值
                    const hasLargeOptions = originalOptions.some(opt => String(opt) === '100');

                    if (!hasLargeOptions) {
                        console.log(LOG_PREFIX + '找到目标组件，正在注入选项...', originalOptions);

                        // 暴力推入新选项
                        // AntD 既支持字符串也支持数字，为了保险我们都兼容一下，通常它会自己处理
                        // 如果原数组是字符串，就推字符串；如果是数字，就推数字
                        const isString = typeof originalOptions[0] === 'string';

                        const newOpts = isString ? ['100', '200'] : [100, 200];

                        // 这里的 push 是安全的，因为 AntD 也就是在 render 的时候读一下这个数组
                        newOpts.forEach(val => {
                             if(!originalOptions.includes(val)) {
                                 originalOptions.push(val);
                             }
                        });

                        // 排序，让 100, 200 排在后面，而不是乱序
                        originalOptions.sort((a, b) => parseFloat(a) - parseFloat(b));

                        console.log(LOG_PREFIX + '注入成功! 当前选项:', props.pageSizeOptions);
                    }

                    // 标记 DOM 防止重复处理
                    target.dataset.antHacked = 'true';
                    found = true;
                    break;
                }

                // 继续向上找父组件
                currentFiber = currentFiber.return;
                depth++;
            }
        });
    }

    // -----------------------------------------------------------
    // 执行策略：轮询 (Polling)
    // -----------------------------------------------------------
    // 为什么用轮询？
    // 1. MutationObserver 很难精准捕捉到 React 内部状态的就绪。
    // 2. 只有当用户鼠标移上去或者组件加载完，Fiber 树才完整。
    // 3. 每 2 秒运行一次的开销极低（几微秒），但极其稳定。

    console.log(LOG_PREFIX + '脚本已启动，开始监控分页组件...');
    setInterval(hijackPageSizeOptions, 2000);

})();